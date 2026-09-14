export const SOCIAL_PROVIDERS = ["youtube", "instagram", "facebook", "tiktok", "linkedin", "threads", "x", "snapchat"];

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
