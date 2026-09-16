function clean(value) { return String(value ?? "").trim(); }
function select(value) { return value?.name || value || ""; }
function truthy(value) {
  if (value === true) return true;
  return ["1", "true", "yes", "oui", "on"].includes(clean(value).toLowerCase());
}

const NETWORKS = ["youtube", "instagram", "facebook", "tiktok", "linkedin", "threads", "pinterest", "x", "snapchat"];
const PLATFORM = {
  youtube: "YouTube", instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok",
  linkedin: "LinkedIn", threads: "Threads", pinterest: "Pinterest", x: "X", snapchat: "Snapchat",
};

const SAFE_PROFILE = {
  youtube: {
    strategy: "NON_PUBLIC_DIRECT_TEST",
    visibility: "private",
    description: "Uploader une vidéo de test en privé uniquement. Ne jamais basculer en public automatiquement.",
  },
  tiktok: {
    strategy: "NON_PUBLIC_DIRECT_TEST",
    visibility: "SELF_ONLY",
    description: "Direct Post limité à SELF_ONLY tant que les tests et l’audit TikTok ne sont pas terminés.",
  },
  pinterest: {
    strategy: "SANDBOX_OR_TRIAL_TEST",
    visibility: "sandbox/trial",
    description: "Créer uniquement un Pin de test dans l’environnement Trial/Sandbox avant toute utilisation production.",
  },
  instagram: {
    strategy: "EXPLICIT_PUBLIC_APPROVAL_REQUIRED",
    visibility: "public_if_executed",
    description: "L’API Instagram ne fournit pas de vrai mode privé équivalent pour ce flux. Préparer le payload, mais ne publier qu’après accord explicite.",
  },
  facebook: {
    strategy: "EXPLICIT_PUBLIC_APPROVAL_REQUIRED",
    visibility: "public_if_executed",
    description: "Préparer et valider le payload sans publication. Un test réel sur la Page exige un accord explicite.",
  },
  threads: {
    strategy: "EXPLICIT_PUBLIC_APPROVAL_REQUIRED",
    visibility: "public_if_executed",
    description: "Préparer le post sans l’envoyer. Un test réel Threads est potentiellement public et exige un accord explicite.",
  },
  linkedin: {
    strategy: "EXPLICIT_PUBLIC_APPROVAL_REQUIRED",
    visibility: "public_if_executed",
    description: "Préparer le post d’organisation sans l’envoyer. Un test réel sur la Page exige un accord explicite.",
  },
  x: {
    strategy: "EXTERNAL_ACCESS_AND_SPEND_APPROVAL_REQUIRED",
    visibility: "none",
    description: "Aucun test réel tant que l’accès API et tout coût éventuel n’ont pas été explicitement approuvés.",
  },
  snapchat: {
    strategy: "EXTERNAL_PRODUCT_APPROVAL_REQUIRED",
    visibility: "none",
    description: "Aucun test serveur tant que Snap n’a pas accordé le produit/API requis pour la publication organique.",
  },
};

function accountFor(provider, records = []) {
  const label = PLATFORM[provider];
  return records.find((record) => clean(select(record?.fields?.Plateforme)).toLowerCase() === label.toLowerCase()) || null;
}
function gatewayFor(provider, statuses = []) {
  return statuses.find((item) => clean(item?.provider).toLowerCase() === provider) || {};
}
function baseDirectReady(fields, gateway) {
  return gateway.direct_configured === true
    && truthy(fields["OAuth Hibou connecté"])
    && truthy(fields["Auth direct OK"])
    && truthy(fields["Lecture API OK"]);
}

export function socialValidationPlanFor(providerInput, { accounts = [], gateways = [], config = {} } = {}) {
  const provider = clean(providerInput).toLowerCase();
  if (!NETWORKS.includes(provider)) throw new Error(`Réseau social non pris en charge: ${provider || "vide"}`);
  const profile = SAFE_PROFILE[provider];
  const account = accountFor(provider, accounts);
  const fields = account?.fields || {};
  const gateway = gatewayFor(provider, gateways);
  const directReady = baseDirectReady(fields, gateway);
  const alreadyTested = truthy(fields["Publication testée"]);
  const pinterestSandbox = truthy(config.social_pinterest_sandbox);

  let executableNonpublic = false;
  let reason = "";
  if (provider === "youtube") {
    executableNonpublic = directReady;
    reason = directReady ? "OAuth + lecture API validés : un upload privé peut être exécuté de façon contrôlée." : "Attendre OAuth direct + read-test réussi.";
  } else if (provider === "tiktok") {
    executableNonpublic = directReady;
    reason = directReady ? "OAuth + lecture API validés : SELF_ONLY peut être utilisé pour le test contrôlé." : "Attendre OAuth direct + read-test réussi.";
  } else if (provider === "pinterest") {
    executableNonpublic = directReady && pinterestSandbox;
    reason = !directReady ? "Attendre OAuth direct + read-test réussi." : pinterestSandbox ? "Sandbox/Trial activé : test contrôlé possible." : "Activer le mode Sandbox/Trial avant tout test automatisé.";
  } else if (["instagram", "facebook", "threads", "linkedin"].includes(provider)) {
    reason = directReady ? "Connexion directe prête, mais aucun test réel ne sera exécuté sans accord explicite car le contenu peut être public." : "Attendre OAuth direct + read-test réussi ; le payload pourra ensuite être validé en dry-run.";
  } else if (provider === "x") {
    reason = "Accès API/coût éventuel et consentement explicite requis avant tout test réel.";
  } else {
    reason = "Accès produit/API Snap requis avant tout test serveur.";
  }

  return {
    provider,
    platform: PLATFORM[provider],
    strategy: profile.strategy,
    enforced_visibility: profile.visibility,
    description: profile.description,
    direct_auth_read_ready: directReady,
    publication_already_tested: alreadyTested,
    executable_nonpublic_test: executableNonpublic && !alreadyTested,
    no_public_side_effect_without_explicit_approval: true,
    reason,
    external_blocker: clean(fields["Blocage externe final"]),
    next_human_action: clean(fields["Étape session autorisations"] || fields["Action humaine restante"]),
  };
}

export function buildSocialValidationPlan({ accounts = [], gateways = [], config = {}, provider = "" } = {}) {
  const requested = clean(provider).toLowerCase();
  const providers = requested ? [requested] : NETWORKS;
  const plans = providers.map((network) => socialValidationPlanFor(network, { accounts, gateways, config }));
  return {
    plans,
    summary: {
      total: plans.length,
      nonpublic_test_ready: plans.filter((item) => item.executable_nonpublic_test).length,
      already_tested: plans.filter((item) => item.publication_already_tested).length,
      explicit_public_approval_required: plans.filter((item) => item.strategy === "EXPLICIT_PUBLIC_APPROVAL_REQUIRED").length,
      external_blocked: plans.filter((item) => item.strategy.startsWith("EXTERNAL_")).length,
    },
  };
}

export const SOCIAL_VALIDATION_NETWORKS = [...NETWORKS];
