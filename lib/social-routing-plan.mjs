const NETWORKS = ["youtube", "instagram", "facebook", "tiktok", "linkedin", "threads", "pinterest", "x", "reddit", "snapchat"];

function clean(value) { return String(value ?? "").trim(); }
function select(value) { return value?.name || value || ""; }
function truthy(value) {
  if (value === true) return true;
  const normalized = clean(value).toLowerCase();
  return ["1", "true", "yes", "oui", "on"].includes(normalized);
}

const PLATFORM = {
  reddit: "Reddit",
  youtube: "YouTube",
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  threads: "Threads",
  pinterest: "Pinterest",
  x: "X",
  snapchat: "Snapchat",
};

function normalizeOperation(value) {
  const operation = clean(value).toLowerCase() || "publish";
  if (!["read", "publish", "analytics"].includes(operation)) throw new Error(`Opération sociale non prise en charge: ${operation}`);
  return operation;
}

function accountFor(provider, records = []) {
  const label = PLATFORM[provider];
  return records.find((record) => clean(select(record?.fields?.Plateforme)).toLowerCase() === label.toLowerCase()) || null;
}

function gatewayFor(provider, statuses = []) {
  return statuses.find((item) => clean(item?.provider).toLowerCase() === provider) || {};
}

function directReady(operation, fields = {}, gateway = {}) {
  const authenticated = truthy(fields["OAuth Hibou connecté"]) && truthy(fields["Auth direct OK"]);
  if (!authenticated || gateway.direct_configured !== true) return false;
  if (operation === "read") return truthy(fields["Lecture API OK"]);
  if (operation === "analytics") return truthy(fields["Analytics OK"]);
  return truthy(fields["Publication testée"]);
}

function metricoolReady(fields = {}) {
  // The fallback is executable only after a real connector check. "Metricool vérifié"
  // describes intended configuration and can be written by the control plane; it is not
  // sufficient proof on its own.
  return truthy(fields["Metricool test réel"]) && truthy(fields["Pilotable depuis ChatGPT"]);
}

function blockedReason(fields = {}, gateway = {}, operation = "publish") {
  const external = clean(fields["Blocage externe final"]);
  const direct = clean(fields["Blocage API direct"]);
  const action = clean(fields["Action humaine restante"] || fields["Étape session autorisations"]);
  const missing = Array.isArray(gateway.missing_direct_env) ? gateway.missing_direct_env.filter(Boolean).join(", ") : "";
  if (external) return external;
  if (direct) return direct;
  if (missing) return `Configuration directe incomplète: ${missing}`;
  if (operation === "analytics") return "Analytics direct non encore validé et aucune voie de secours disponible.";
  if (action) return action;
  return "Aucune voie d’exécution vérifiée n’est actuellement disponible.";
}

export function socialRouteFor(providerInput, { operation = "publish", accounts = [], gateways = [], policy = {} } = {}) {
  const provider = clean(providerInput).toLowerCase();
  if (!NETWORKS.includes(provider)) throw new Error(`Réseau social non pris en charge: ${provider || "vide"}`);
  const op = normalizeOperation(operation);
  const account = accountFor(provider, accounts);
  const fields = account?.fields || {};
  const gateway = gatewayFor(provider, gateways);
  const direct = directReady(op, fields, gateway);
  const webhook = op === "publish" && gateway.webhook_configured === true;
  const metricool = metricoolReady(fields);

  let route = "blocked";
  let ready = false;
  let executionContext = "none";
  if (direct) {
    route = "direct_api";
    ready = true;
    executionContext = "hibou_runtime";
  } else if (webhook) {
    route = "webhook_fallback";
    ready = true;
    executionContext = "hibou_runtime";
  } else if (metricool) {
    route = "chatgpt_metricool";
    ready = true;
    executionContext = "chatgpt_connector";
  }

  const testMode = truthy(policy.test_mode);
  const reviewRequired = policy.review_required === undefined ? true : truthy(policy.review_required);
  const liveRuntimeAllowed = op !== "publish" || (!testMode && !reviewRequired);
  const humanPhase = clean(fields["Phase autorisation"]);

  return {
    provider,
    platform: PLATFORM[provider],
    operation: op,
    ready,
    route,
    execution_context: executionContext,
    autonomous_runtime: executionContext === "hibou_runtime",
    chatgpt_connector_available: metricool,
    direct_ready: direct,
    webhook_ready: webhook,
    metricool_ready: metricool,
    metricool_real_tested: truthy(fields["Metricool test réel"]),
    metricool_declared_verified: truthy(fields["Metricool vérifié"]),
    oauth_connected: truthy(fields["OAuth Hibou connecté"]),
    read_tested: truthy(fields["Lecture API OK"]),
    publish_tested: truthy(fields["Publication testée"]),
    analytics_tested: truthy(fields["Analytics OK"]),
    authorization_phase: humanPhase,
    human_approval_next: humanPhase === "HUMAN_OAUTH_APPROVAL_REQUIRED" || truthy(fields["Prêt validation humaine"]),
    live_runtime_allowed_by_policy: liveRuntimeAllowed,
    blocker: ready ? "" : blockedReason(fields, gateway, op),
    next_human_action: clean(fields["Étape session autorisations"] || fields["Action humaine restante"]),
    external_blocker: clean(fields["Blocage externe final"]),
  };
}

export function buildSocialRoutingPlan({ operation = "publish", provider = "", accounts = [], gateways = [], policy = {} } = {}) {
  const op = normalizeOperation(operation);
  const requested = clean(provider).toLowerCase();
  const providers = requested ? [requested] : NETWORKS;
  const routes = providers.map((network) => socialRouteFor(network, { operation: op, accounts, gateways, policy }));
  return {
    operation: op,
    routes,
    summary: {
      total: routes.length,
      ready: routes.filter((item) => item.ready).length,
      direct: routes.filter((item) => item.route === "direct_api").length,
      webhook: routes.filter((item) => item.route === "webhook_fallback").length,
      metricool: routes.filter((item) => item.route === "chatgpt_metricool").length,
      blocked: routes.filter((item) => item.route === "blocked").length,
      human_oauth_ready: routes.filter((item) => item.human_approval_next).length,
    },
  };
}

export const SOCIAL_ROUTING_NETWORKS = [...NETWORKS];
