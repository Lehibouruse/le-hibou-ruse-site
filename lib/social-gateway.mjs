const PROVIDERS = ["youtube", "instagram", "facebook", "tiktok", "linkedin", "threads", "x", "snapchat"];
const MAX_MEDIA_BYTES = 90 * 1024 * 1024;
const TIKTOK_SINGLE_CHUNK_MAX = 64 * 1024 * 1024;

function clean(value) {
  return String(value || "").trim();
}

function envName(provider, suffix) {
  return `HIBOU_SOCIAL_${provider.toUpperCase()}_${suffix}`;
}

function webhookUrl(provider, env = process.env) {
  return clean(env[envName(provider, "WEBHOOK_URL")]);
}

function hasAll(env, names) {
  return names.every((name) => Boolean(clean(env[name])));
}

function youtubeConfigured(env) {
  return Boolean(clean(env.YOUTUBE_ACCESS_TOKEN))
    || hasAll(env, ["YOUTUBE_REFRESH_TOKEN", "YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET"]);
}

function tiktokConfigured(env) {
  return Boolean(clean(env.TIKTOK_ACCESS_TOKEN))
    || hasAll(env, ["TIKTOK_REFRESH_TOKEN", "TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"]);
}

function directConfigured(provider, env = process.env) {
  if (provider === "tiktok") return tiktokConfigured(env);
  if (provider === "youtube") return youtubeConfigured(env);
  if (provider === "instagram") return hasAll(env, ["META_ACCESS_TOKEN", "INSTAGRAM_BUSINESS_ACCOUNT_ID"]);
  if (provider === "facebook") return Boolean(clean(env.FACEBOOK_PAGE_ACCESS_TOKEN) || clean(env.META_ACCESS_TOKEN)) && Boolean(clean(env.FACEBOOK_PAGE_ID));
  if (provider === "threads") return hasAll(env, ["THREADS_ACCESS_TOKEN", "THREADS_USER_ID"]);
  if (provider === "linkedin") return hasAll(env, ["LINKEDIN_ACCESS_TOKEN", "LINKEDIN_AUTHOR_URN", "LINKEDIN_VERSION"]);
  if (provider === "x") return Boolean(clean(env.X_ACCESS_TOKEN));
  return false;
}

function missingDirectEnv(provider, env = process.env) {
  const missing = [];
  const need = (name) => { if (!clean(env[name])) missing.push(name); };
  if (provider === "youtube") {
    if (!clean(env.YOUTUBE_ACCESS_TOKEN) && !hasAll(env, ["YOUTUBE_REFRESH_TOKEN", "YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET"])) {
      missing.push("YOUTUBE_ACCESS_TOKEN or YOUTUBE_REFRESH_TOKEN+YOUTUBE_CLIENT_ID+YOUTUBE_CLIENT_SECRET");
    }
  } else if (provider === "tiktok") {
    if (!clean(env.TIKTOK_ACCESS_TOKEN) && !hasAll(env, ["TIKTOK_REFRESH_TOKEN", "TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"])) {
      missing.push("TIKTOK_ACCESS_TOKEN or TIKTOK_REFRESH_TOKEN+TIKTOK_CLIENT_KEY+TIKTOK_CLIENT_SECRET");
    }
  } else if (provider === "instagram") {
    need("META_ACCESS_TOKEN"); need("INSTAGRAM_BUSINESS_ACCOUNT_ID");
  } else if (provider === "facebook") {
    if (!clean(env.FACEBOOK_PAGE_ACCESS_TOKEN) && !clean(env.META_ACCESS_TOKEN)) missing.push("FACEBOOK_PAGE_ACCESS_TOKEN or META_ACCESS_TOKEN");
    need("FACEBOOK_PAGE_ID");
  } else if (provider === "threads") {
    need("THREADS_ACCESS_TOKEN"); need("THREADS_USER_ID");
  } else if (provider === "linkedin") {
    need("LINKEDIN_ACCESS_TOKEN"); need("LINKEDIN_AUTHOR_URN"); need("LINKEDIN_VERSION");
  } else if (provider === "x") {
    need("X_ACCESS_TOKEN");
  } else if (provider === "snapchat") {
    missing.push("Snap Public Profile API approval + connector implementation");
  }
  return missing;
}

function requestedMode(provider, env = process.env) {
  const mode = clean(env[envName(provider, "MODE")]).toLowerCase();
  return ["direct", "webhook", "auto"].includes(mode) ? mode : "auto";
}

function resolvedMode(provider, env = process.env) {
  const desired = requestedMode(provider, env);
  const webhook = Boolean(webhookUrl(provider, env));
  const direct = directConfigured(provider, env);
  if (desired === "direct") return direct ? "direct" : webhook ? "webhook" : "unconfigured";
  if (desired === "webhook") return webhook ? "webhook" : direct ? "direct" : "unconfigured";
  return webhook ? "webhook" : direct ? "direct" : "unconfigured";
}

function directCapabilities(provider) {
  if (["youtube", "instagram", "facebook", "tiktok", "threads"].includes(provider)) return ["video_native"];
  if (["linkedin", "x"].includes(provider)) return ["text_link"];
  return [];
}

export function socialGatewayStatus(env = process.env) {
  return PROVIDERS.map((provider) => {
    const webhook = Boolean(webhookUrl(provider, env));
    const direct = directConfigured(provider, env);
    const mode = resolvedMode(provider, env);
    return {
      provider,
      configured: webhook || direct,
      mode,
      requested_mode: requestedMode(provider, env),
      webhook_configured: webhook,
      direct_configured: direct,
      direct_capabilities: directCapabilities(provider),
      live_publish_supported: webhook || (direct && provider !== "snapchat"),
      missing_direct_env: direct ? [] : missingDirectEnv(provider, env),
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

async function responseData(response) {
  const text = await response.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return { text: text.slice(0, 2000) }; }
}

function apiError(label, response, data) {
  const detail = data?.error?.message || data?.error?.code || data?.message || data?.error_description || data?.text || response.statusText || "unknown";
  return new Error(`${label} ${response.status}: ${String(detail).slice(0, 800)}`);
}

async function postJson(url, body, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  const data = await responseData(response);
  if (!response.ok) throw apiError("Social API", response, data);
  return { data, headers: response.headers };
}

async function postForm(url, fields, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers },
    body: new URLSearchParams(Object.entries(fields).filter(([, value]) => value !== undefined && value !== null).map(([key, value]) => [key, String(value)])),
    cache: "no-store",
  });
  const data = await responseData(response);
  if (!response.ok) throw apiError("Social API", response, data);
  return { data, headers: response.headers };
}

async function getJson(url, headers = {}) {
  const response = await fetch(url, { headers, cache: "no-store" });
  const data = await responseData(response);
  if (!response.ok) throw apiError("Social API", response, data);
  return data;
}

async function dispatchWebhook(provider, payload, env = process.env) {
  const url = webhookUrl(provider, env);
  if (!url) throw new Error(`Webhook ${provider} non configuré`);
  const headers = {};
  const secret = clean(env.HIBOU_SOCIAL_WEBHOOK_SECRET);
  if (secret) headers.Authorization = `Bearer ${secret}`;
  return (await postJson(url, { provider, source: "HIBOU_AGENT_V1", ...payload }, headers)).data;
}

async function resolveTikTokToken(env) {
  if (clean(env.TIKTOK_ACCESS_TOKEN)) return clean(env.TIKTOK_ACCESS_TOKEN);
  if (!hasAll(env, ["TIKTOK_REFRESH_TOKEN", "TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"])) throw new Error("Credentials TikTok absents");
  const { data } = await postForm("https://open.tiktokapis.com/v2/oauth/token/", {
    client_key: env.TIKTOK_CLIENT_KEY,
    client_secret: env.TIKTOK_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: env.TIKTOK_REFRESH_TOKEN,
  });
  if (!data.access_token) throw new Error("TikTok refresh sans access_token");
  return data.access_token;
}

async function fetchMedia(url, maxBytes = MAX_MEDIA_BYTES) {
  const response = await fetch(assertMediaUrl(url), { cache: "no-store" });
  if (!response.ok) throw new Error(`Téléchargement média: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error("Média vide");
  if (bytes.length > maxBytes) throw new Error(`Média trop volumineux (${bytes.length} octets, max ${maxBytes})`);
  return { bytes, contentType: response.headers.get("content-type") || "video/mp4" };
}

async function dispatchTikTok(payload, env = process.env) {
  const token = await resolveTikTokToken(env);
  const auth = { Authorization: `Bearer ${token}` };
  const creator = (await postJson("https://open.tiktokapis.com/v2/post/publish/creator_info/query/", {}, auth)).data;
  const allowed = creator?.data?.privacy_level_options || [];
  const requestedPrivacy = clean(payload.privacy_level) || "SELF_ONLY";
  const privacyLevel = allowed.includes(requestedPrivacy) ? requestedPrivacy : allowed.includes("SELF_ONLY") ? "SELF_ONLY" : allowed[0];
  if (!privacyLevel) throw new Error("TikTok ne renvoie aucun niveau de confidentialité autorisé");

  const postInfo = {
    title: clean(payload.caption).slice(0, 2200),
    privacy_level: privacyLevel,
    disable_duet: Boolean(payload.disable_duet),
    disable_comment: Boolean(payload.disable_comment),
    disable_stitch: Boolean(payload.disable_stitch),
    brand_organic_toggle: payload.brand_organic_toggle !== false,
    is_aigc: payload.is_aigc !== false,
  };
  const transferMode = clean(env.TIKTOK_TRANSFER_MODE).toUpperCase() || "FILE_UPLOAD";
  if (transferMode === "PULL_FROM_URL") {
    const result = (await postJson("https://open.tiktokapis.com/v2/post/publish/video/init/", {
      post_info: postInfo,
      source_info: { source: "PULL_FROM_URL", video_url: assertMediaUrl(payload.media_url) },
    }, auth)).data;
    return { provider: "tiktok", publish_id: result?.data?.publish_id || "", privacy_level: privacyLevel, transfer_mode: transferMode };
  }

  const media = await fetchMedia(payload.media_url, TIKTOK_SINGLE_CHUNK_MAX);
  const size = media.bytes.length;
  const initialized = (await postJson("https://open.tiktokapis.com/v2/post/publish/video/init/", {
    post_info: postInfo,
    source_info: { source: "FILE_UPLOAD", video_size: size, chunk_size: size, total_chunk_count: 1 },
  }, auth)).data;
  const uploadUrl = initialized?.data?.upload_url;
  if (!uploadUrl) throw new Error("TikTok n'a pas renvoyé d'upload_url");
  const upload = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(size),
      "Content-Range": `bytes 0-${size - 1}/${size}`,
    },
    body: media.bytes,
  });
  if (!upload.ok) throw new Error(`TikTok upload ${upload.status}: ${(await upload.text()).slice(0, 500)}`);
  return { provider: "tiktok", publish_id: initialized?.data?.publish_id || "", privacy_level: privacyLevel, transfer_mode: "FILE_UPLOAD" };
}

function metaBase(env) {
  const version = clean(env.META_GRAPH_VERSION);
  return version ? `https://graph.facebook.com/${version}` : "https://graph.facebook.com";
}

async function waitMetaContainer(base, containerId, token, attempts = 20) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const status = await getJson(`${base}/${encodeURIComponent(containerId)}?fields=status_code,status&access_token=${encodeURIComponent(token)}`);
    const code = clean(status.status_code || status.status).toUpperCase();
    if (["FINISHED", "PUBLISHED"].includes(code)) return status;
    if (["ERROR", "EXPIRED"].includes(code)) throw new Error(`Meta container ${code}`);
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error("Meta container toujours en traitement");
}

async function dispatchInstagram(payload, env) {
  const token = clean(env.META_ACCESS_TOKEN);
  const account = clean(env.INSTAGRAM_BUSINESS_ACCOUNT_ID);
  const base = metaBase(env);
  const created = (await postForm(`${base}/${account}/media`, {
    media_type: "REELS",
    video_url: assertMediaUrl(payload.media_url),
    caption: clean(payload.caption).slice(0, 2200),
    share_to_feed: "true",
    access_token: token,
  })).data;
  if (!created.id) throw new Error("Instagram n'a pas renvoyé de container id");
  await waitMetaContainer(base, created.id, token);
  const published = (await postForm(`${base}/${account}/media_publish`, { creation_id: created.id, access_token: token })).data;
  return { provider: "instagram", container_id: created.id, media_id: published.id || "" };
}

async function dispatchFacebook(payload, env) {
  const token = clean(env.FACEBOOK_PAGE_ACCESS_TOKEN) || clean(env.META_ACCESS_TOKEN);
  const pageId = clean(env.FACEBOOK_PAGE_ID);
  const base = metaBase(env);
  const result = (await postForm(`${base}/${pageId}/videos`, {
    file_url: assertMediaUrl(payload.media_url),
    description: clean(payload.caption).slice(0, 5000),
    title: clean(payload.title).slice(0, 255),
    access_token: token,
  })).data;
  return { provider: "facebook", video_id: result.id || "" };
}

async function dispatchThreads(payload, env) {
  const token = clean(env.THREADS_ACCESS_TOKEN);
  const userId = clean(env.THREADS_USER_ID);
  const version = clean(env.THREADS_API_VERSION) || "v1.0";
  const base = `https://graph.threads.net/${version}`;
  const created = (await postForm(`${base}/${userId}/threads`, {
    media_type: "VIDEO",
    video_url: assertMediaUrl(payload.media_url),
    text: clean(payload.caption).slice(0, 500),
    access_token: token,
  })).data;
  if (!created.id) throw new Error("Threads n'a pas renvoyé de container id");
  await waitMetaContainer(base, created.id, token, 15);
  const published = (await postForm(`${base}/${userId}/threads_publish`, { creation_id: created.id, access_token: token })).data;
  return { provider: "threads", container_id: created.id, thread_id: published.id || "" };
}

async function resolveYoutubeToken(env) {
  if (clean(env.YOUTUBE_ACCESS_TOKEN)) return clean(env.YOUTUBE_ACCESS_TOKEN);
  if (!hasAll(env, ["YOUTUBE_REFRESH_TOKEN", "YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET"])) throw new Error("Credentials YouTube absents");
  const { data } = await postForm("https://oauth2.googleapis.com/token", {
    client_id: env.YOUTUBE_CLIENT_ID,
    client_secret: env.YOUTUBE_CLIENT_SECRET,
    refresh_token: env.YOUTUBE_REFRESH_TOKEN,
    grant_type: "refresh_token",
  });
  if (!data.access_token) throw new Error("Google refresh sans access_token");
  return data.access_token;
}

async function dispatchYouTube(payload, env) {
  const token = await resolveYoutubeToken(env);
  const media = await fetchMedia(payload.media_url);
  const privacy = ["public", "private", "unlisted"].includes(clean(payload.privacy_level).toLowerCase())
    ? clean(payload.privacy_level).toLowerCase()
    : "private";
  const metadata = {
    snippet: {
      title: (clean(payload.title) || clean(payload.caption) || "Le Hibou Rusé").slice(0, 100),
      description: clean(payload.caption).slice(0, 5000),
      ...(Array.isArray(payload.metadata?.tags) ? { tags: payload.metadata.tags.map(clean).filter(Boolean).slice(0, 30) } : {}),
    },
    status: { privacyStatus: privacy },
  };
  const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": String(media.bytes.length),
      "X-Upload-Content-Type": media.contentType,
    },
    body: JSON.stringify(metadata),
    cache: "no-store",
  });
  const initData = await responseData(init);
  if (!init.ok) throw apiError("YouTube init", init, initData);
  const location = init.headers.get("location");
  if (!location) throw new Error("YouTube n'a pas renvoyé d'URL resumable");
  const upload = await fetch(location, {
    method: "PUT",
    headers: { "Content-Type": media.contentType, "Content-Length": String(media.bytes.length) },
    body: media.bytes,
  });
  const result = await responseData(upload);
  if (!upload.ok) throw apiError("YouTube upload", upload, result);
  return { provider: "youtube", video_id: result.id || "", privacy_level: privacy };
}

async function dispatchX(payload, env) {
  const token = clean(env.X_ACCESS_TOKEN);
  const url = assertMediaUrl(payload.media_url);
  const caption = clean(payload.caption);
  const text = `${caption.slice(0, 240)}${caption ? "\n" : ""}${url}`.slice(0, 500);
  const result = (await postJson("https://api.x.com/2/tweets", {
    text,
    ...(payload.is_aigc ? { made_with_ai: true } : {}),
  }, { Authorization: `Bearer ${token}` })).data;
  return { provider: "x", post_id: result?.data?.id || "", native_video: false };
}

async function dispatchLinkedIn(payload, env) {
  const token = clean(env.LINKEDIN_ACCESS_TOKEN);
  const author = clean(env.LINKEDIN_AUTHOR_URN);
  const version = clean(env.LINKEDIN_VERSION);
  const response = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "LinkedIn-Version": version,
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      author,
      commentary: clean(payload.caption).slice(0, 3000),
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      content: { article: { source: assertMediaUrl(payload.media_url), title: (clean(payload.title) || "Le Hibou Rusé").slice(0, 200), description: clean(payload.caption).slice(0, 256) } },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
    cache: "no-store",
  });
  const data = await responseData(response);
  if (!response.ok) throw apiError("LinkedIn", response, data);
  return { provider: "linkedin", post_id: response.headers.get("x-restli-id") || data.id || "", native_video: false };
}

async function dispatchDirect(provider, payload, env) {
  if (provider === "tiktok") return dispatchTikTok(payload, env);
  if (provider === "instagram") return dispatchInstagram(payload, env);
  if (provider === "facebook") return dispatchFacebook(payload, env);
  if (provider === "threads") return dispatchThreads(payload, env);
  if (provider === "youtube") return dispatchYouTube(payload, env);
  if (provider === "x") return dispatchX(payload, env);
  if (provider === "linkedin") return dispatchLinkedIn(payload, env);
  throw new Error(`${provider}: adaptateur direct non implémenté`);
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
  if (status.mode === "direct") {
    const result = await dispatchDirect(provider, payload, env);
    return { ok: true, dry_run: false, provider, mode: "direct", result };
  }
  throw new Error(`${provider}: aucun chemin de publication résolu`);
}
