import { createRecord, queryRecords, TABLES, updateRecord } from "./airtable.js";
import { socialGatewayStatusWithVault } from "./social-credentials-runtime.mjs";
import { buildSocialRoutingPlan } from "./social-routing-plan.mjs";

const ROUTE_FIELDS = {
  read: "Route lecture",
  publish: "Route publication",
  analytics: "Route analytics",
};
const HEALTH_FIELDS = ["Statut OAuth coffre", "Expiration OAuth", "Erreur OAuth"];
const LIFECYCLE_FIELDS = ["Phase autorisation", "Prêt validation humaine", "Action humaine restante"];

function clean(value) { return String(value ?? "").trim(); }
function select(value) { return value?.name || value || ""; }

function providerForPlatform(value) {
  const platform = clean(select(value)).toLowerCase();
  return ({
    youtube: "youtube", instagram: "instagram", facebook: "facebook", tiktok: "tiktok",
    linkedin: "linkedin", threads: "threads", pinterest: "pinterest", x: "x", snapchat: "snapchat",
  })[platform] || "";
}

export function routeFieldsForProvider(provider, plans = {}) {
  const fields = {};
  for (const operation of Object.keys(ROUTE_FIELDS)) {
    const route = plans?.[operation]?.routes?.find((item) => item.provider === provider)?.route || "blocked";
    fields[ROUTE_FIELDS[operation]] = route;
  }
  return fields;
}

export function oauthHealthFields(provider, gateways = []) {
  const gateway = gateways.find((item) => item.provider === provider) || {};
  return {
    "Statut OAuth coffre": clean(gateway.vault_status),
    "Expiration OAuth": gateway.credential_expires_at || null,
    "Erreur OAuth": clean(gateway.vault_last_error || gateway.vault_error).slice(0, 2000),
  };
}

export function oauthLifecycleFields(provider, gateways = []) {
  const gateway = gateways.find((item) => item.provider === provider) || {};
  if (clean(gateway.vault_status).toLowerCase() !== "needs reauth") return {};
  const detail = clean(gateway.vault_last_error || gateway.vault_error);
  return {
    "Phase autorisation": "HUMAN_OAUTH_REAUTH_REQUIRED",
    "Prêt validation humaine": true,
    "Action humaine restante": `Reconnecter ${provider} via /admin/social.${detail ? ` Motif: ${detail.slice(0, 500)}` : ""}`,
  };
}

function comparable(field, value) {
  if (field === "Expiration OAuth") return value ? new Date(value).toISOString() : "";
  if (field === "Prêt validation humaine") return value === true ? "true" : "false";
  return clean(select(value));
}

export function stateTransition(current = {}, next = {}) {
  const changes = {};
  const tracked = [...Object.values(ROUTE_FIELDS), ...HEALTH_FIELDS, ...LIFECYCLE_FIELDS]
    .filter((field) => Object.prototype.hasOwnProperty.call(next, field));
  for (const field of tracked) {
    const before = comparable(field, current[field]);
    const after = comparable(field, next[field]);
    if (before !== after) changes[field] = { from: before, to: after };
  }
  return changes;
}

export function routeTransition(current = {}, next = {}) {
  const all = stateTransition(current, next);
  return Object.fromEntries(Object.entries(all).filter(([field]) => Object.values(ROUTE_FIELDS).includes(field)));
}

async function journalStateTransition(provider, platform, changes) {
  if (!Object.keys(changes).length) return;
  const now = new Date().toISOString();
  const routeChanged = Object.keys(changes).some((field) => Object.values(ROUTE_FIELDS).includes(field));
  const healthChanged = Object.keys(changes).some((field) => HEALTH_FIELDS.includes(field));
  const lifecycleChanged = Object.keys(changes).some((field) => LIFECYCLE_FIELDS.includes(field));
  const kinds = [routeChanged ? "route" : "", healthChanged ? "OAuth health" : "", lifecycleChanged ? "authorization phase" : ""].filter(Boolean);
  await createRecord(TABLES.journal, {
    Workflow: "HIBOU_SOCIAL_ROUTING_V1",
    Déclencheur: "state reconciliation",
    Action: `${provider} · ${kinds.join(" + ")} transition`,
    Statut: "ok",
    "Dernière exécution": now,
    "ID externe": `social-state:${provider}:${Date.now()}`,
    Erreur: "",
    Notes: JSON.stringify({ provider, platform, changes, at: now }).slice(0, 10000),
  }).catch(() => {});
}

export async function syncSocialRoutingPlanToAirtable(env = process.env) {
  const accounts = await queryRecords(TABLES.socialAccounts, { pageSize: 50 });
  const gateways = await socialGatewayStatusWithVault(env);
  const plans = Object.fromEntries(["read", "publish", "analytics"].map((operation) => [
    operation,
    buildSocialRoutingPlan({ operation, accounts, gateways }),
  ]));

  const updated = [];
  const unchanged = [];
  for (const account of accounts) {
    const provider = providerForPlatform(account.fields?.Plateforme);
    if (!provider) continue;
    const fields = {
      ...routeFieldsForProvider(provider, plans),
      ...oauthHealthFields(provider, gateways),
      ...oauthLifecycleFields(provider, gateways),
    };
    const changes = stateTransition(account.fields || {}, fields);
    const platform = select(account.fields?.Plateforme);
    if (!Object.keys(changes).length) {
      unchanged.push({ provider, platform, record_id: account.id });
      continue;
    }
    await updateRecord(TABLES.socialAccounts, account.id, fields);
    await journalStateTransition(provider, platform, changes);
    updated.push({ provider, platform, record_id: account.id, changes, ...fields });
  }

  return {
    updated_count: updated.length,
    unchanged_count: unchanged.length,
    updated,
    summaries: Object.fromEntries(Object.entries(plans).map(([operation, plan]) => [operation, plan.summary])),
    synced_at: new Date().toISOString(),
  };
}
