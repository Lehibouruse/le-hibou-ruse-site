export const SOCIAL_PROVIDERS = ["youtube", "instagram", "facebook", "tiktok", "linkedin", "threads", "pinterest", "x", "bluesky", "reddit", "snapchat"];

const NON_SECRET_ENV_CONFIG = {
  social_reddit_subreddit: "REDDIT_SUBREDDIT",
  social_reddit_expected_username: "REDDIT_EXPECTED_USERNAME",
  social_oauth_scopes_youtube: "YOUTUBE_OAUTH_SCOPES",
  social_oauth_scopes_tiktok: "TIKTOK_OAUTH_SCOPES",
  social_oauth_scopes_meta: "META_OAUTH_SCOPES",
  social_oauth_scopes_instagram: "INSTAGRAM_OAUTH_SCOPES",
  social_oauth_scopes_linkedin: "LINKEDIN_OAUTH_SCOPES",
  social_oauth_scopes_threads: "THREADS_OAUTH_SCOPES",
  social_oauth_scopes_pinterest: "PINTEREST_OAUTH_SCOPES",
  social_oauth_scopes_x: "X_OAUTH_SCOPES",
  social_bluesky_pds_url: "BLUESKY_PDS_URL",
  social_youtube_analytics_lookback_days: "YOUTUBE_ANALYTICS_LOOKBACK_DAYS",
  social_meta_graph_version: "META_GRAPH_VERSION",
  social_instagram_graph_version: "INSTAGRAM_GRAPH_VERSION",
  social_meta_target_page_id: "META_TARGET_PAGE_ID",
  social_linkedin_organization_urn: "LINKEDIN_ORGANIZATION_URN",
  social_linkedin_version: "LINKEDIN_VERSION",
  social_tiktok_app_audited: "TIKTOK_APP_AUDITED",
  social_tiktok_transfer_mode: "TIKTOK_TRANSFER_MODE",
  social_pinterest_board_id: "PINTEREST_BOARD_ID",
  social_pinterest_sandbox: "PINTEREST_SANDBOX",
};

export function configurationMap(records = []) {
  return Object.fromEntries(records
    .filter((record) => record?.fields?.Actif !== false)
    .map((record) => [record.fields?.Clé, record.fields?.Valeur]));
}

export function boolConfig(value, fallback = false) {
  if (value === true || value === false) return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["true", "1", "yes", "oui"].includes(normalized)) return true;
  if (["false", "0", "no", "non"].includes(normalized)) return false;
  return fallback;
}

export function socialRuntimeEnv(config = {}, baseEnv = process.env) {
  const env = { ...baseEnv };
  for (const provider of SOCIAL_PROVIDERS) {
    const requested = String(config[`social_mode_${provider}`] || "").trim().toLowerCase();
    if (["auto", "direct", "webhook"].includes(requested)) {
      env[`HIBOU_SOCIAL_${provider.toUpperCase()}_MODE`] = requested;
    }
  }
  for (const [configKey, envKey] of Object.entries(NON_SECRET_ENV_CONFIG)) {
    const value = String(config[configKey] ?? "").trim();
    if (value) env[envKey] = value;
  }
  return env;
}

export function socialPolicy(config = {}) {
  return {
    gateway_enabled: boolConfig(config.social_gateway_enabled, true),
    test_mode: boolConfig(config.social_test_mode, true),
    review_required: boolConfig(config.social_publication_requires_review, true),
    first_videos_review_count: Number(config.human_review_first_videos || 10),
  };
}

export { NON_SECRET_ENV_CONFIG as SOCIAL_NON_SECRET_ENV_CONFIG };
