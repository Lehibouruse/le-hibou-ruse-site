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
  },
  meta: {
    label: "Meta · Instagram + Facebook",
    airtablePlatforms: ["Instagram", "Facebook"],
    portal: "https://developers.facebook.com/apps/",
    requiredEnv: ["HIBOU_SOCIAL_VAULT_KEY", "META_APP_ID", "META_APP_SECRET", "META_GRAPH_VERSION"],
    optionalEnv: ["META_OAUTH_SCOPES", "META_TARGET_PAGE_ID"],
    fallbackNetworks: ["instagram", "facebook"],
  },
  tiktok: {
    label: "TikTok",
    airtablePlatforms: ["TikTok"],
    portal: "https://developers.tiktok.com/apps/",
    requiredEnv: ["HIBOU_SOCIAL_VAULT_KEY", "TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
    optionalEnv: ["TIKTOK_OAUTH_SCOPES"],
    fallbackNetworks: ["tiktok"],
  },
  linkedin: {
    label: "LinkedIn",
    airtablePlatforms: ["LinkedIn"],
    portal: "https://developer.linkedin.com/",
    requiredEnv: ["HIBOU_SOCIAL_VAULT_KEY", "LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"],
    optionalEnv: ["LINKEDIN_OAUTH_SCOPES", "LINKEDIN_ORGANIZATION_URN"],
    fallbackNetworks: ["linkedin"],
  },
  pinterest: {
    label: "Pinterest",
    airtablePlatforms: ["Pinterest"],
    portal: "https://developers.pinterest.com/apps/",
    requiredEnv: ["HIBOU_SOCIAL_VAULT_KEY", "PINTEREST_APP_ID", "PINTEREST_APP_SECRET"],
    optionalEnv: ["PINTEREST_OAUTH_SCOPES", "PINTEREST_BOARD_ID"],
    fallbackNetworks: ["pinterest"],
  },
  x: {
    label: "X",
    airtablePlatforms: ["X"],
    portal: "https://developer.x.com/",
    requiredEnv: ["HIBOU_SOCIAL_VAULT_KEY", "X_CLIENT_ID"],
    optionalEnv: ["X_CLIENT_SECRET", "X_OAUTH_SCOPES"],
    fallbackNetworks: ["x"],
  },
  threads: {
    label: "Threads",
    airtablePlatforms: ["Threads"],
    portal: "https://developers.facebook.com/apps/",
    requiredEnv: ["HIBOU_SOCIAL_VAULT_KEY", "THREADS_APP_ID", "THREADS_APP_SECRET"],
    optionalEnv: ["THREADS_OAUTH_SCOPES"],
    fallbackNetworks: ["threads"],
  },
  snapchat: {
    label: "Snapchat",
    airtablePlatforms: ["Snapchat"],
    portal: "https://developers.snap.com/",
    requiredEnv: [],
    optionalEnv: [],
    fallbackNetworks: ["snapchat"],
    manualOnly: true,
  },
};

function clean(value) {
  return String(value ?? "").trim();
}

function present(name, env) {
  return clean(env?.[name]).length > 0;
}

function phaseFor(grant, envReady) {
  if (grant.manual_only) return "EXTERNAL_PRODUCT_APPROVAL_REQUIRED";
  if (!envReady) return "SERVER_SECRETS_REQUIRED";
  if (!grant.app_ready) return "DEVELOPER_APP_CONFIGURATION_REQUIRED";
  if (!grant.credential_connected) return "HUMAN_OAUTH_APPROVAL_REQUIRED";
  if (!grant.publish_scope_ok) return "PUBLISH_SCOPE_REVIEW_REQUIRED";
  if (!grant.analytics_scope_ok) return "ANALYTICS_SCOPE_REVIEW_REQUIRED";
  return "AUTHORIZED";
}

function humanAction(provider, grant, envMissing, phase) {
  const callback = grant.redirect_uri || "le callback affiché dans /admin/social/control-plane";
  if (phase === "EXTERNAL_PRODUCT_APPROVAL_REQUIRED") return grant.blocker;
  if (phase === "SERVER_SECRETS_REQUIRED") return `Configurer côté serveur: ${envMissing.join(", ")}. Ne jamais stocker ces secrets dans Airtable.`;
  if (phase === "DEVELOPER_APP_CONFIGURATION_REQUIRED") return `${grant.next_action} Callback à déclarer exactement: ${callback}`;
  if (phase === "HUMAN_OAUTH_APPROVAL_REQUIRED") return `Tout est prêt côté Hibou. Ouvrir /api/social/oauth/${provider}/start et valider personnellement l'écran d'autorisation ${grant.label}.`;
  if (phase === "PUBLISH_SCOPE_REVIEW_REQUIRED" || phase === "ANALYTICS_SCOPE_REVIEW_REQUIRED") return grant.next_action;
  return "Aucune validation OAuth restante. Conserver les publications live sous validation humaine tant que les tests non publics ne sont pas terminés.";
}

function absoluteOauthStart(grant, provider) {
  if (grant.manual_only || !grant.redirect_uri) return "";
  try {
    const origin = new URL(grant.redirect_uri).origin;
    return `${origin}/api/social/oauth/${provider}/start`;
  } catch {
    return "";
  }
}

export function buildSocialControlPlane({ readiness = [], credentials = [], env = process.env } = {}) {
  const grants = auditSocialGrants(readiness, credentials);
  const providers = grants.map((grant) => {
    const meta = PROVIDERS[grant.provider] || {
      label: grant.label || grant.provider,
      airtablePlatforms: [],
      portal: "",
      requiredEnv: [],
      optionalEnv: [],
      fallbackNetworks: [grant.provider],
    };
    const envMissing = meta.requiredEnv.filter((name) => !present(name, env));
    const envReady = envMissing.length === 0;
    const phase = phaseFor(grant, envReady);
    const fallback = Object.fromEntries(meta.fallbackNetworks.map((network) => [network, socialWebhookFallbackConfigured(network, env)]));
    const fallbackEnv = meta.fallbackNetworks.map((network) => `HIBOU_SOCIAL_${network.toUpperCase()}_WEBHOOK_URL`);
    return {
      ...grant,
      label: meta.label,
      phase,
      ready_for_human_approval: phase === "HUMAN_OAUTH_APPROVAL_REQUIRED",
      server_env_ready: envReady,
      required_env_names: [...meta.requiredEnv],
      optional_env_names: [...meta.optionalEnv],
      missing_env_names: envMissing,
      developer_portal: meta.portal,
      oauth_start_path: grant.manual_only ? "" : `/api/social/oauth/${grant.provider}/start`,
      oauth_start_url: absoluteOauthStart(grant, grant.provider),
      airtable_platforms: [...meta.airtablePlatforms],
      fallback_webhooks: fallback,
      fallback_webhook_env_names: fallbackEnv,
      fallback_configured: Object.values(fallback).some(Boolean),
      human_action: humanAction(grant.provider, grant, envMissing, phase),
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
    },
    providers,
    safety: {
      secrets_exposed: false,
      secrets_stored_in_airtable: false,
      oauth_launched: false,
      public_publication_triggered: false,
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

function envDescription(provider) {
  const required = (provider.required_env_names || []).join("\n");
  const optional = (provider.optional_env_names || []).length ? `\nOptionnel: ${(provider.optional_env_names || []).join(", ")}` : "";
  return `${required}${optional}`.trim();
}

export async function syncSocialControlPlaneToAirtable(snapshot) {
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
        "Phase autorisation": clean(provider.phase),
        "Portail développeur": clean(provider.developer_portal) || null,
        "Variables serveur requises": envDescription(provider),
        "Prêt validation humaine": provider.ready_for_human_approval === true,
        "Fallback webhook prêt": provider.fallback_configured === true,
      };
      if (provider.redirect_uri) fields["Callback OAuth"] = provider.redirect_uri;
      if (provider.oauth_start_url) fields["Lien validation OAuth"] = provider.oauth_start_url;
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
