import { configMap, queryRecords, TABLES } from "./airtable.js";

const KEYS = {
  social_oauth_scopes_youtube: "YOUTUBE_OAUTH_SCOPES",
  social_oauth_scopes_tiktok: "TIKTOK_OAUTH_SCOPES",
  social_oauth_scopes_meta: "META_OAUTH_SCOPES",
  social_oauth_scopes_linkedin: "LINKEDIN_OAUTH_SCOPES",
  social_oauth_scopes_x: "X_OAUTH_SCOPES",
  social_oauth_scopes_threads: "THREADS_OAUTH_SCOPES",
};

export function applySocialScopeConfig(env = process.env, config = {}) {
  const next = { ...env };
  for (const [configKey, envKey] of Object.entries(KEYS)) {
    const value = String(config[configKey] || "").trim();
    if (value) next[envKey] = value;
  }
  return next;
}

export async function socialOauthRuntimeEnv(env = process.env) {
  const records = await queryRecords(TABLES.configuration, {
    filterByFormula: `OR(${Object.keys(KEYS).map((key) => `{Clé}='${key}'`).join(",")})`,
    pageSize: 20,
    priorityAware: false,
  });
  return applySocialScopeConfig(env, configMap(records));
}

export { KEYS as SOCIAL_SCOPE_CONFIG_KEYS };
