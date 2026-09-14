const PROVIDERS = ["youtube", "instagram", "facebook", "tiktok", "linkedin", "threads", "x", "snapchat"];

function clean(value) {
  return String(value || "").trim();
}

function envName(provider, suffix) {
  return `HIBOU_SOCIAL_${provider.toUpperCase()}_${suffix}`;
}

function webhookUrl(provider, env = process.env) {
  return clean(env[envName(provider, "WEBHOOK_URL")]);
}

function directConfigured(provider, env = process.env) {
  if (provider === "tiktok") return Boolean(clean(env.TIKTOK_ACCESS_TOKEN));
  if (provider === "youtube") return Boolean(clean(env.YOUTUBE_ACCESS_TOKEN));
  if (provider === "instagram") return Boolean(clean(env.META_ACCESS_TOKEN) && clean(env.INSTAGRAM_BUSINESS_ACCOUNT_ID));
  if (provider === "facebook") return Boolean(clean(env.META_ACCESS_TOKEN) && clean(env.FACEBOOK_PAGE_ID));
  if (provider === "threads") return Boolean(clean(env.THREADS_ACCESS_TOKEN) && clean(env.THREADS_USER_ID));
  if (provider === "linkedin") return Boolean(clean(env.LINKEDIN_ACCESS_TOKEN) && clean(env.LINKEDIN_AUTHOR_URN));
  if (provider === "x") return Boolean(clean(env.X_ACCESS_TOKEN));
  if (provider === "snapchat") return Boolean(clean(env.SNAPCHAT_ACCESS_TOKEN));
  return false;
}

export function socialGatewayStatus(env = process.env) {
  return PROVIDERS.map((provider) => {
    const webhook = Boolean(webhookUrl(provider, env));
    const direct = directConfigured(provider, env);
    return {
      provider,
      configured: webhook || direct,
      mode: webhook ? "webhook" : direct ? "direct" : "unconfigured",
      live_publish_supported: webhook || provider === "tiktok",
    };
  });
}

function assertProvider(provider) {
  const normalized = clean(provider).toLowerCase();
  if (!PROVIDERS.includes(normalized)) throw new Error(`Réseau social non pris en charge: ${normalized || "vide"}`);
  return normalized;
}

function assertMediaUrl(url) {
  const parsed = new URL(clean(url));
  if (parsed.protocol !== "https:") throw new Error("media_url doit utiliser HTTPS");
  return parsed.toString();
}

async function postJson(url, body, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.error?.message || data?.error?.code || data?.message || response.statusText || "unknown";
    throw new Error(`Social API ${response.status}: ${String(detail).slice(0, 500)}`);
  }
  return data;
}

async function dispatchWebhook(provider, payload, env = process.env) {
  const url = webhookUrl(provider, env);
  if (!url) throw new Error(`Webhook ${provider} non configuré`);
  const headers = {};
  const secret = clean(env.HIBOU_SOCIAL_WEBHOOK_SECRET);
  if (secret) headers.Authorization = `Bearer ${secret}`;
  return postJson(url, { provider, source: "HIBOU_AGENT_V1", ...payload }, headers);
}

async function dispatchTikTok(payload, env = process.env) {
  const token = clean(env.TIKTOK_ACCESS_TOKEN);
  if (!token) throw new Error("TIKTOK_ACCESS_TOKEN absent");
  const auth = { Authorization: `Bearer ${token}` };
  const creator = await postJson(
    "https://open.tiktokapis.com/v2/post/publish/creator_info/query/",
    {},
    auth,
  );
  const allowed = creator?.data?.privacy_level_options || [];
  const requestedPrivacy = clean(payload.privacy_level) || "SELF_ONLY";
  const privacyLevel = allowed.includes(requestedPrivacy)
    ? requestedPrivacy
    : allowed.includes("SELF_ONLY") ? "SELF_ONLY" : allowed[0];
  if (!privacyLevel) throw new Error("TikTok ne renvoie aucun niveau de confidentialité autorisé");

  const result = await postJson(
    "https://open.tiktokapis.com/v2/post/publish/video/init/",
    {
      post_info: {
        title: clean(payload.caption).slice(0, 2200),
        privacy_level: privacyLevel,
        disable_duet: Boolean(payload.disable_duet),
        disable_comment: Boolean(payload.disable_comment),
        disable_stitch: Boolean(payload.disable_stitch),
        brand_organic_toggle: payload.brand_organic_toggle !== false,
        is_aigc: payload.is_aigc !== false,
      },
      source_info: {
        source: "PULL_FROM_URL",
        video_url: assertMediaUrl(payload.media_url),
      },
    },
    auth,
  );
  return { provider: "tiktok", publish_id: result?.data?.publish_id || "", privacy_level: privacyLevel };
}

export async function dispatchSocialPost(input, env = process.env) {
  const provider = assertProvider(input?.provider);
  const mediaUrl = assertMediaUrl(input?.media_url);
  const payload = {
    media_url: mediaUrl,
    caption: clean(input?.caption).slice(0, 5000),
    title: clean(input?.title).slice(0, 500),
    privacy_level: clean(input?.privacy_level),
    is_aigc: input?.is_aigc !== false,
    brand_organic_toggle: input?.brand_organic_toggle !== false,
    disable_duet: Boolean(input?.disable_duet),
    disable_comment: Boolean(input?.disable_comment),
    disable_stitch: Boolean(input?.disable_stitch),
    metadata: input?.metadata && typeof input.metadata === "object" ? input.metadata : {},
  };

  const status = socialGatewayStatus(env).find((item) => item.provider === provider);
  if (input?.dry_run !== false) {
    return { ok: true, dry_run: true, provider, gateway: status, payload };
  }
  if (!status?.configured) throw new Error(`${provider}: aucune connexion sociale configurée côté serveur`);

  if (status.mode === "webhook") {
    const result = await dispatchWebhook(provider, payload, env);
    return { ok: true, dry_run: false, provider, mode: "webhook", result };
  }
  if (provider === "tiktok") {
    const result = await dispatchTikTok(payload, env);
    return { ok: true, dry_run: false, provider, mode: "direct", result };
  }

  throw new Error(`${provider}: credentials détectés, mais publication directe non encore activée dans le gateway; utiliser le webhook approuvé ou compléter l'adaptateur direct`);
}
