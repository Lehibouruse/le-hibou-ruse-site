import { queryRecords, updateRecord } from "./airtable.js";
import { auditSocialGrants, socialGrantSummary } from "./social-grant-audit.mjs";
import { socialCredentialStatuses } from "./social-credential-vault.mjs";
import { socialWebhookFallbackConfigured } from "./social-fallback.mjs";
import { oauthProviderReadiness } from "./social-oauth.mjs";

const SOCIAL_ACCOUNTS_TABLE_ID = "tbljG9MzITNILBoHi";

const PROVIDERS = {
  youtube: {
    label: "YouTube",
    airtablePlatforms: ["YouTube"],
    portal: "https://console.cloud.google.com/apis/credentials",
    requiredEnv: ["HIBOU_SOCIAL_VAULT_KEY", "YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET"],
    optionalEnv: ["YOUTUBE_OAUTH_SCOPES"],
    fallbackNetworks: ["youtube"],
    metricoolVerified: true,
    externalPhase: "EXTERNAL_GOOGLE_OAUTH_APP_SETUP_REQUIRED",
    externalBlocker: "Créer/configurer le projet Google Cloud du Hibou, activer YouTube Data API v3 et YouTube Analytics API, créer un client OAuth Web et déclarer exactement le callback Hibou. Les scopes préparés couvrent publication + lecture + analytics : youtube, youtube.readonly et yt-analytics.readonly. Une fois Client ID/Secret placés côté Vercel, le réseau passe à HUMAN_OAUTH_APPROVAL_REQUIRED. Une vérification Google peut ensuite être requise pour une application publique utilisant des scopes YouTube sensibles.",
    sessionStep: "Google Cloud → activer YouTube Data API v3 + YouTube Analytics API → écran de consentement OAuth → application Web → ajouter le callback affiché → placer Client ID/Secret dans Vercel → revenir au bouton Valider l’autorisation.",
  },
  meta: {
    label: "Meta · Instagram + Facebook",
    airtablePlatforms: ["Instagram", "Facebook"],
    portal: "https://developers.facebook.com/apps/",
    requiredEnv: ["HIBOU_SOCIAL_VAULT_KEY", "META_APP_ID", "META_APP_SECRET", "META_GRAPH_VERSION"],
    optionalEnv: ["META_OAUTH_SCOPES", "META_TARGET_PAGE_ID"],
    fallbackNetworks: ["instagram", "facebook"],
    metricoolVerified: true,
    externalPhase: "EXTERNAL_META_APP_SETUP_REQUIRED",
    externalBlocker: "Créer/configurer l’app Meta du Hibou, déclarer le callback, rattacher la Page Facebook au compte Instagram professionnel et activer les permissions prévues : pages_show_list, pages_manage_posts, pages_read_engagement, read_insights, instagram_basic, instagram_content_publish et instagram_manage_insights. Les permissions avancées/app review peuvent être nécessaires pour un usage live au-delà des rôles de l’app. Après App ID/Secret côté Vercel, l’étape suivante est HUMAN_OAUTH_APPROVAL_REQUIRED.",
    sessionStep: "Meta for Developers → app Hibou → configurer Facebook/Instagram + callback → vérifier liaison Page Facebook ↔ Instagram professionnel → activer les permissions publication + insights préparées → placer App ID/Secret dans Vercel → lancer l’OAuth.",
  },
  tiktok: {
    label: "TikTok",
    airtablePlatforms: ["TikTok"],
    portal: "https://developers.tiktok.com/apps/",
    requiredEnv: ["HIBOU_SOCIAL_VAULT_KEY", "TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
    optionalEnv: ["TIKTOK_OAUTH_SCOPES"],
    fallbackNetworks: ["tiktok"],
    metricoolVerified: true,
    externalPhase: "EXTERNAL_TIKTOK_APP_PRODUCT_APPROVAL_REQUIRED",
    externalBlocker: "Créer/configurer l’app TikTok, ajouter Login Kit + Content Posting API, enregistrer le callback et obtenir video.publish/video.upload. Tant que l’app n’est pas auditée, le direct public reste limité et SELF_ONLY est imposé. Pour les photos/carrousels directs en PULL_FROM_URL, le domaine ou préfixe hébergeant les images doit aussi être vérifié dans l’app TikTok. Après Client Key/Secret côté Vercel, le consentement OAuth utilisateur devient possible ; l’audit TikTok et la vérification du domaine média restent les blocages externes du live.",
    sessionStep: "TikTok for Developers → app Hibou → Login Kit + Content Posting API → callback → déclarer/vérifier le domaine ou préfixe média utilisé par PULL_FROM_URL → Client Key/Secret dans Vercel → OAuth → tests SELF_ONLY → audit/approbation TikTok avant le public.",
  },
  linkedin: {
    label: "LinkedIn",
    airtablePlatforms: ["LinkedIn"],
    portal: "https://www.linkedin.com/developers/apps",
    requiredEnv: ["HIBOU_SOCIAL_VAULT_KEY", "LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
    optionalEnv: ["LINKEDIN_OAUTH_SCOPES", "LINKEDIN_ORGANIZATION_URN"],
    fallbackNetworks: ["linkedin"],
    metricoolVerified: true,
    externalPhase: "EXTERNAL_LINKEDIN_COMMUNITY_MANAGEMENT_ACCESS_REQUIRED",
    externalBlocker: "Le Hibou cible la Page/organisation LinkedIn. L’app doit obtenir Community Management API puis les permissions w_organization_social pour publier au nom de l’organisation et rw_organization_admin pour le reporting, avec un compte ayant le rôle ADMINISTRATOR sur la Page. r_organization_social est préparé pour la lecture. L’identifiant organisation est déjà connu. Après Client ID/Secret et accès produit, l’OAuth utilisateur devient possible.",
    sessionStep: "LinkedIn Developers → app Hibou → demander/activer Community Management API → vérifier le rôle ADMINISTRATOR du compte → callback → Client ID/Secret dans Vercel → OAuth avec w_organization_social + r_organization_social + rw_organization_admin.",
  },
  pinterest: {
    label: "Pinterest",
    airtablePlatforms: ["Pinterest"],
    portal: "https://developers.pinterest.com/apps/",
    requiredEnv: ["HIBOU_SOCIAL_VAULT_KEY", "PINTEREST_APP_ID", "PINTEREST_APP_SECRET"],
    optionalEnv: ["PINTEREST_OAUTH_SCOPES", "PINTEREST_BOARD_ID"],
    fallbackNetworks: ["pinterest"],
    metricoolVerified: true,
    externalPhase: "EXTERNAL_PINTEREST_TRIAL_ACCESS_APPROVAL_REQUIRED",
    externalBlocker: "Pinterest exige l’enregistrement de l’app et l’approbation Trial Access avant l’accès API normal. Le Trial permet les tests ; Standard Access sera requis pour un usage de production complet. Après App ID/Secret + Trial, l’OAuth Hibou peut être validé. Le board cible est une configuration non secrète qui pourra être renseignée après découverte/choix du board.",
    sessionStep: "Pinterest Developers → Connect app → demander Trial Access → déclarer callback → placer App ID/Secret dans Vercel → OAuth → sélectionner/valider le board cible → plus tard demander Standard Access avec démo OAuth pour la production.",
  },
  x: {
    label: "X",
    airtablePlatforms: ["X"],
    portal: "https://developer.x.com/en/portal/dashboard",
    requiredEnv: ["HIBOU_SOCIAL_VAULT_KEY", "X_CLIENT_ID"],
    optionalEnv: ["X_CLIENT_SECRET", "X_OAUTH_SCOPES"],
    fallbackNetworks: ["x"],
    metricoolVerified: false,
    externalPhase: "EXTERNAL_X_API_ACCESS_AND_BILLING_APPROVAL_REQUIRED",
    externalBlocker: "Créer/configurer un projet/app X avec OAuth 2.0 et droits d’écriture. Tout choix de plan, crédits ou dépense API reste bloqué jusqu’à validation explicite de Marc ; aucune dépense automatique ne sera engagée. Une fois l’accès choisi et le Client ID disponible, l’OAuth peut être lancé.",
    sessionStep: "X Developer Portal → vérifier l’offre/API disponible et son coût → validation explicite de toute dépense → créer/configurer l’app + callback + OAuth 2.0 write → Client ID/Secret éventuel dans Vercel → OAuth.",
  },
  threads: {
    label: "Threads",
    airtablePlatforms: ["Threads"],
    portal: "https://developers.facebook.com/apps/",
    requiredEnv: ["HIBOU_SOCIAL_VAULT_KEY", "THREADS_APP_ID", "THREADS_APP_SECRET"],
    optionalEnv: ["THREADS_OAUTH_SCOPES"],
    fallbackNetworks: ["threads"],
    metricoolVerified: true,
    externalPhase: "EXTERNAL_THREADS_APP_SETUP_REQUIRED",
    externalBlocker: "Créer/configurer l’app Threads chez Meta, enregistrer le callback et activer threads_basic, threads_content_publish et threads_manage_insights. Après App ID/Secret côté Vercel, la prochaine étape devient le consentement OAuth personnel.",
    sessionStep: "Meta for Developers → app Threads Hibou → callback → permissions Threads → App ID/Secret dans Vercel → bouton OAuth Threads.",
  },
  snapchat: {
    label: "Snapchat",
    airtablePlatforms: ["Snapchat"],
    portal: "https://developers.snap.com/",
    requiredEnv: [],
    optionalEnv: [],
    fallbackNetworks: ["snapchat"],
    metricoolVerified: false,
    manualOnly: true,
    externalPhase: "EXTERNAL_SNAP_PRODUCT_APPROVAL_REQUIRED",
    externalBlocker: "La publication organique serveur Snapchat reste dépendante d’un produit/API Snap et d’une approbation externe adaptée. Aucun faux connecteur ni scraping de session ne sera utilisé. Tant que Snap n’accorde pas cette capacité, le direct Hibou reste bloqué.",
    sessionStep: "Snap Developer Portal → vérifier/solliciter l’accès produit officiel permettant la gestion/publication organique du Public Profile. Reprendre l’intégration seulement après approbation Snap.",
  },
};

function clean(value) {
  return String(value ?? "").trim();
}

function present(name, env) {
  if (name === "HIBOU_SOCIAL_VAULT_KEY") {
    return clean(env?.HIBOU_SOCIAL_VAULT_KEY).length > 0 || clean(env?.CRON_SECRET).length > 0;
  }
  return clean(env?.[name]).length > 0;
}

function phaseFor(grant, meta, envReady) {
  if (grant.manual_only || meta.manualOnly) return meta.externalPhase || "EXTERNAL_PRODUCT_APPROVAL_REQUIRED";
  if (!envReady || !grant.app_ready) return meta.externalPhase || "DEVELOPER_APP_CONFIGURATION_REQUIRED";
  if (!grant.credential_connected) return "HUMAN_OAUTH_APPROVAL_REQUIRED";
  if (!grant.publish_scope_ok) return "PUBLISH_SCOPE_REVIEW_REQUIRED";
  if (!grant.analytics_scope_ok) return "ANALYTICS_SCOPE_REVIEW_REQUIRED";
  return "AUTHORIZED";
}

function humanAction(provider, grant, meta, envMissing, phase) {
  if (phase.startsWith("EXTERNAL_")) {
    const missing = envMissing.length ? ` Variables serveur encore absentes: ${envMissing.join(", ")}.` : "";
    return `${meta.externalBlocker || grant.blocker}${missing}`.trim();
  }
  if (phase === "HUMAN_OAUTH_APPROVAL_REQUIRED") return `Tout est prêt côté Hibou. Ouvrir /api/social/oauth/${provider}/start et valider personnellement l’écran d’autorisation ${grant.label}.`;
  if (phase === "PUBLISH_SCOPE_REVIEW_REQUIRED" || phase === "ANALYTICS_SCOPE_REVIEW_REQUIRED") return grant.next_action;
  return "Aucune validation OAuth restante. Conserver les publications live sous validation humaine tant que les tests non publics ne sont pas terminés.";
}

export function buildSocialControlPlane({ readiness = [], credentials = [], env = process.env } = {}) {
  const grants = auditSocialGrants(readiness, credentials, env);
  const providers = grants.map((grant) => {
    const meta = PROVIDERS[grant.provider] || {
      label: grant.label || grant.provider,
      airtablePlatforms: [],
      portal: "",
      requiredEnv: [],
      optionalEnv: [],
      fallbackNetworks: [grant.provider],
      metricoolVerified: false,
      externalPhase: "DEVELOPER_APP_CONFIGURATION_REQUIRED",
      externalBlocker: grant.blocker || "Configurer l’app développeur.",
      sessionStep: grant.next_action || "Configurer l’app développeur.",
    };
    const envMissing = meta.requiredEnv.filter((name) => !present(name, env));
    const envReady = envMissing.length === 0;
    const phase = phaseFor(grant, meta, envReady);
    const fallback = Object.fromEntries(meta.fallbackNetworks.map((network) => [network, socialWebhookFallbackConfigured(network, env)]));
    const fallbackEnv = meta.fallbackNetworks.map((network) => `HIBOU_SOCIAL_${network.toUpperCase()}_WEBHOOK_URL`);
    const metricoolVerified = meta.metricoolVerified === true;
    return {
      ...grant,
      label: grant.label || meta.label,
      phase,
      ready_for_human_approval: phase === "HUMAN_OAUTH_APPROVAL_REQUIRED",
      server_env_ready: envReady,
      required_env_names: [...meta.requiredEnv],
      optional_env_names: [...meta.optionalEnv],
      missing_env_names: envMissing,
      developer_portal: meta.portal,
      oauth_start_path: grant.manual_only ? "" : `/api/social/oauth/${grant.provider}/start`,
      airtable_platforms: [...meta.airtablePlatforms],
      fallback_webhooks: fallback,
      fallback_webhook_env_names: fallbackEnv,
      fallback_configured: Object.values(fallback).some(Boolean),
      metricool_verified: metricoolVerified,
      chatgpt_pilotable: metricoolVerified,
      external_blocker: meta.externalBlocker || grant.blocker || "",
      authorization_session_step: meta.sessionStep || "",
      human_action: humanAction(grant.provider, grant, meta, envMissing, phase),
    };
  });
  const baseSummary = socialGrantSummary(grants);
  return {
    generated_at: new Date().toISOString(),
    summary: {
      ...baseSummary,
      ready_for_human_approval: providers.filter((item) => item.ready_for_human_approval).length,
      server_env_ready: providers.filter((item) => !item.manual_only && item.server_env_ready).length,
      fallback_webhooks_configured: providers.filter((item) => item.fallback_configured).length,
      metricool_verified: providers.filter((item) => item.metricool_verified).length,
      chatgpt_pilotable: providers.filter((item) => item.chatgpt_pilotable).length,
      exact_external_blockers: providers.filter((item) => item.phase.startsWith("EXTERNAL_")).length,
    },
    providers,
    safety: {
      secrets_exposed: false,
      secrets_stored_in_airtable: false,
      oauth_launched: false,
      public_publication_triggered: false,
      paid_api_purchase_triggered: false,
    },
  };
}

export async function socialControlPlaneSnapshot(env = process.env) {
  const readiness = oauthProviderReadiness(env);
  const credentials = await socialCredentialStatuses();
  return buildSocialControlPlane({ readiness, credentials, env });
}

function selectName(value) {
  return typeof value === "string" ? value : value?.name || "";
}

function stateFor(provider) {
  if (provider.manual_only) return "NOT_CONFIGURED";
  if (!provider.credential_connected) return "NOT_CONFIGURED";
  return "AUTHENTICATED";
}

function absoluteStartUrl(provider, env = process.env) {
  if (!provider.oauth_start_path) return "";
  const base = clean(env.HIBOU_PUBLIC_BASE_URL)
    || (clean(env.VERCEL_PROJECT_PRODUCTION_URL) ? `https://${clean(env.VERCEL_PROJECT_PRODUCTION_URL)}` : "")
    || "https://le-hibou-ruse-site.vercel.app";
  try { return new URL(provider.oauth_start_path, base).toString(); }
  catch { return ""; }
}

export async function syncSocialControlPlaneToAirtable(snapshot, env = process.env) {
  const records = await queryRecords(SOCIAL_ACCOUNTS_TABLE_ID, { pageSize: 50 });
  const byPlatform = new Map();
  for (const record of records) {
    const platform = selectName(record.fields?.Plateforme);
    if (platform) byPlatform.set(platform.toLowerCase(), record);
  }

  const updated = [];
  const missingRecords = [];
  for (const provider of snapshot.providers || []) {
    for (const platform of provider.airtable_platforms || []) {
      const record = byPlatform.get(platform.toLowerCase());
      if (!record) {
        missingRecords.push(platform);
        continue;
      }
      const fields = {
        "Direct Hibou prêt": provider.manual_only !== true,
        "OAuth Hibou connecté": provider.credential_connected === true,
        "État direct": stateFor(provider),
        "Blocage API direct": clean(provider.human_action).slice(0, 10000),
        "Action humaine restante": clean(provider.human_action).slice(0, 10000),
        "Phase autorisation": clean(provider.phase).slice(0, 255),
        "Callback OAuth": clean(provider.redirect_uri),
        "Portail développeur": clean(provider.developer_portal),
        "Variables serveur requises": [...provider.required_env_names, ...provider.optional_env_names.map((name) => `Optionnel: ${name}`)].join("\n"),
        "Lien validation OAuth": absoluteStartUrl(provider, env),
        "Prêt validation humaine": provider.ready_for_human_approval === true,
        "Fallback webhook prêt": provider.fallback_configured === true,
        "Metricool vérifié": provider.metricool_verified === true,
        "Pilotable depuis ChatGPT": provider.chatgpt_pilotable === true,
        "Blocage externe final": clean(provider.external_blocker).slice(0, 10000),
        "Étape session autorisations": clean(provider.authorization_session_step).slice(0, 10000),
      };
      if (provider.scopes) fields["Permissions API"] = provider.scopes;
      await updateRecord(SOCIAL_ACCOUNTS_TABLE_ID, record.id, fields);
      updated.push({ platform, record_id: record.id, provider: provider.provider, phase: provider.phase });
    }
  }

  return {
    updated_count: updated.length,
    updated,
    missing_records: missingRecords,
    synced_at: new Date().toISOString(),
  };
}

export { PROVIDERS as SOCIAL_CONTROL_PLANE_PROVIDERS, SOCIAL_ACCOUNTS_TABLE_ID };
