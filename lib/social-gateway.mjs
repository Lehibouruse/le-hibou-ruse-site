const PROVIDERS = ["youtube", "instagram", "facebook", "tiktok", "linkedin", "threads", "pinterest", "x", "bluesky", "snapchat"];
const MAX_MEDIA_BYTES = 90 * 1024 * 1024;
const TIKTOK_SINGLE_CHUNK_MAX = 64 * 1024 * 1024;
const X_CHUNK_BYTES = 4 * 1024 * 1024;

function clean(value) {
  return String(value || "").trim();
}

function flag(value, fallback = false) {
  if (value === true || value === false) return value;
  const normalized = clean(value).toLowerCase();
  if (["1", "true", "yes", "oui", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "non", "off"].includes(normalized)) return false;
  return fallback;
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
  if (provider === "instagram") return hasAll(env, ["INSTAGRAM_ACCESS_TOKEN", "INSTAGRAM_BUSINESS_ACCOUNT_ID"]);
  if (provider === "facebook") return Boolean(clean(env.FACEBOOK_PAGE_ACCESS_TOKEN) || clean(env.META_ACCESS_TOKEN)) && Boolean(clean(env.FACEBOOK_PAGE_ID));
  if (provider === "threads") return hasAll(env, ["THREADS_ACCESS_TOKEN", "THREADS_USER_ID"]);
  if (provider === "linkedin") return hasAll(env, ["LINKEDIN_ACCESS_TOKEN", "LINKEDIN_ORGANIZATION_URN", "LINKEDIN_VERSION"]);
  if (provider === "pinterest") return hasAll(env, ["PINTEREST_ACCESS_TOKEN", "PINTEREST_BOARD_ID"]);
  if (provider === "x") return Boolean(clean(env.X_ACCESS_TOKEN));
  if (provider === "bluesky") return hasAll(env, ["BLUESKY_IDENTIFIER", "BLUESKY_APP_PASSWORD"]);
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
    need("INSTAGRAM_ACCESS_TOKEN"); need("INSTAGRAM_BUSINESS_ACCOUNT_ID");
  } else if (provider === "facebook") {
    if (!clean(env.FACEBOOK_PAGE_ACCESS_TOKEN) && !clean(env.META_ACCESS_TOKEN)) missing.push("FACEBOOK_PAGE_ACCESS_TOKEN or META_ACCESS_TOKEN");
    need("FACEBOOK_PAGE_ID");
  } else if (provider === "threads") {
    need("THREADS_ACCESS_TOKEN"); need("THREADS_USER_ID");
  } else if (provider === "linkedin") {
    need("LINKEDIN_ACCESS_TOKEN"); need("LINKEDIN_ORGANIZATION_URN"); need("LINKEDIN_VERSION");
  } else if (provider === "pinterest") {
    need("PINTEREST_ACCESS_TOKEN"); need("PINTEREST_BOARD_ID");
  } else if (provider === "x") {
    need("X_ACCESS_TOKEN");
  } else if (provider === "bluesky") {
    need("BLUESKY_IDENTIFIER"); need("BLUESKY_APP_PASSWORD");
  } else if (provider === "snapchat") {
    missing.push("Snap Public Profile API approval + server-side organic publishing capability");
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
  return direct ? "direct" : webhook ? "webhook" : "unconfigured";
}

function directCapabilities(provider, env = process.env) {
  if (provider === "pinterest") return flag(env.PINTEREST_SANDBOX, true) ? ["image_native"] : ["image_native", "video_native"];
  if (provider === "bluesky") return ["text_native", "image_native"];
  if (["youtube", "instagram", "facebook", "tiktok", "threads", "linkedin", "x"].includes(provider)) return ["video_native"];
  return [];
}

export function socialGatewayStatus(env = process.env) {
  return PROVIDERS.map((provider) => {
    const webhook = Boolean(webhookUrl(provider, env));
    const direct = directConfigured(provider, env);
    const mode = resolvedMode(provider, env);
    const constraints = [];
    if (provider === "tiktok" && direct && !flag(env.TIKTOK_APP_AUDITED, false)) constraints.push("direct_public_requires_tiktok_audit; SELF_ONLY enforced before audit");
    if (provider === "pinterest" && direct && flag(env.PINTEREST_SANDBOX, true)) constraints.push("sandbox_image_only; video_pins unavailable in Pinterest Sandbox");
    if (provider === "snapchat") constraints.push("server-side organic publishing requires Snap approval/product access");
    return {
      provider,
      configured: webhook || direct,
      mode,
      requested_mode: requestedMode(provider, env),
      webhook_configured: webhook,
      direct_configured: direct,
      direct_capabilities: directCapabilities(provider, env),
      live_publish_supported: webhook || (direct && provider !== "snapchat"),
      missing_direct_env: direct ? [] : missingDirectEnv(provider, env),
      constraints,
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
  const audited = flag(env.TIKTOK_APP_AUDITED, false);
  const requestedPrivacy = clean(payload.privacy_level) || "SELF_ONLY";
  const desiredPrivacy = audited ? requestedPrivacy : "SELF_ONLY";
  const privacyLevel = allowed.includes(desiredPrivacy) ? desiredPrivacy : allowed.includes("SELF_ONLY") ? "SELF_ONLY" : allowed[0];
  if (!privacyLevel) throw new Error("TikTok ne renvoie aucun niveau de confidentialité autorisé");
  if (!audited && privacyLevel !== "SELF_ONLY") throw new Error("TikTok direct public refusé avant audit de l'application");

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
    return { provider: "tiktok", publish_id: result?.data?.publish_id || "", privacy_level: privacyLevel, transfer_mode: transferMode, audited };
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
    headers: { "Content-Type": "video/mp4", "Content-Length": String(size), "Content-Range": `bytes 0-${size - 1}/${size}` },
    body: media.bytes,
  });
  if (!upload.ok) throw new Error(`TikTok upload ${upload.status}: ${(await upload.text()).slice(0, 500)}`);
  return { provider: "tiktok", publish_id: initialized?.data?.publish_id || "", privacy_level: privacyLevel, transfer_mode: "FILE_UPLOAD", audited };
}

function metaBase(env) {
  const version = clean(env.META_GRAPH_VERSION);
  return version ? `https://graph.facebook.com/${version}` : "https://graph.facebook.com";
}

function instagramBase(env) {
  const version = clean(env.INSTAGRAM_GRAPH_VERSION) || "v26.0";
  return `https://graph.instagram.com/${version}`;
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

async function waitThreadsContainer(base, containerId, token, attempts = 20) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const state = await getJson(`${base}/${encodeURIComponent(containerId)}?fields=id,status,error_message&access_token=${encodeURIComponent(token)}`);
    const status = clean(state.status).toUpperCase();
    if (["FINISHED", "PUBLISHED"].includes(status)) return state;
    if (["ERROR", "EXPIRED"].includes(status)) throw new Error(`Threads container ${status}: ${clean(state.error_message)}`);
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error("Threads container toujours en traitement");
}

async function dispatchInstagram(payload, env) {
  const token = clean(env.INSTAGRAM_ACCESS_TOKEN);
  const account = clean(env.INSTAGRAM_BUSINESS_ACCOUNT_ID);
  const base = instagramBase(env);
  const created = (await postForm(`${base}/${account}/media`, {
    media_type: "REELS", video_url: assertMediaUrl(payload.media_url), caption: clean(payload.caption).slice(0, 2200), share_to_feed: "true", access_token: token,
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
    file_url: assertMediaUrl(payload.media_url), description: clean(payload.caption).slice(0, 5000), title: clean(payload.title).slice(0, 255), access_token: token,
  })).data;
  return { provider: "facebook", video_id: result.id || "" };
}

async function dispatchThreads(payload, env) {
  const token = clean(env.THREADS_ACCESS_TOKEN);
  const userId = clean(env.THREADS_USER_ID);
  const version = clean(env.THREADS_API_VERSION) || "v1.0";
  const base = `https://graph.threads.net/${version}`;
  const created = (await postForm(`${base}/${userId}/threads`, {
    media_type: "VIDEO", video_url: assertMediaUrl(payload.media_url), text: clean(payload.caption).slice(0, 500), access_token: token,
  })).data;
  if (!created.id) throw new Error("Threads n'a pas renvoyé de container id");
  await waitThreadsContainer(base, created.id, token, 20);
  const published = (await postForm(`${base}/${userId}/threads_publish`, { creation_id: created.id, access_token: token })).data;
  return { provider: "threads", container_id: created.id, thread_id: published.id || "" };
}

async function resolveYoutubeToken(env) {
  if (clean(env.YOUTUBE_ACCESS_TOKEN)) return clean(env.YOUTUBE_ACCESS_TOKEN);
  if (!hasAll(env, ["YOUTUBE_REFRESH_TOKEN", "YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET"])) throw new Error("Credentials YouTube absents");
  const { data } = await postForm("https://oauth2.googleapis.com/token", {
    client_id: env.YOUTUBE_CLIENT_ID, client_secret: env.YOUTUBE_CLIENT_SECRET, refresh_token: env.YOUTUBE_REFRESH_TOKEN, grant_type: "refresh_token",
  });
  if (!data.access_token) throw new Error("Google refresh sans access_token");
  return data.access_token;
}

async function dispatchYouTube(payload, env) {
  const token = await resolveYoutubeToken(env);
  const media = await fetchMedia(payload.media_url);
  const privacy = ["public", "private", "unlisted"].includes(clean(payload.privacy_level).toLowerCase()) ? clean(payload.privacy_level).toLowerCase() : "private";
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
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Length": String(media.bytes.length), "X-Upload-Content-Type": media.contentType },
    body: JSON.stringify(metadata), cache: "no-store",
  });
  const initData = await responseData(init);
  if (!init.ok) throw apiError("YouTube init", init, initData);
  const location = init.headers.get("location");
  if (!location) throw new Error("YouTube n'a pas renvoyé d'URL resumable");
  const upload = await fetch(location, { method: "PUT", headers: { "Content-Type": media.contentType, "Content-Length": String(media.bytes.length) }, body: media.bytes });
  const result = await responseData(upload);
  if (!upload.ok) throw apiError("YouTube upload", upload, result);
  return { provider: "youtube", video_id: result.id || "", privacy_level: privacy };
}

async function uploadXVideo(media, token) {
  const auth = { Authorization: `Bearer ${token}` };
  const initialized = (await postJson("https://api.x.com/2/media/upload/initialize", {
    media_type: "video/mp4", total_bytes: media.bytes.length, media_category: "tweet_video", shared: false,
  }, auth)).data;
  const mediaId = clean(initialized?.data?.id || initialized?.id);
  if (!mediaId) throw new Error("X n'a pas renvoyé de media id");
  for (let offset = 0, segment = 0; offset < media.bytes.length; offset += X_CHUNK_BYTES, segment += 1) {
    const chunk = media.bytes.subarray(offset, Math.min(media.bytes.length, offset + X_CHUNK_BYTES));
    const form = new FormData();
    form.append("segment_index", String(segment));
    form.append("media", new Blob([chunk], { type: "video/mp4" }), `hibou-${segment}.mp4`);
    const response = await fetch(`https://api.x.com/2/media/upload/${encodeURIComponent(mediaId)}/append`, { method: "POST", headers: auth, body: form, cache: "no-store" });
    const data = await responseData(response);
    if (!response.ok) throw apiError("X append", response, data);
  }
  const finalized = await fetch(`https://api.x.com/2/media/upload/${encodeURIComponent(mediaId)}/finalize`, { method: "POST", headers: auth, cache: "no-store" });
  const finalData = await responseData(finalized);
  if (!finalized.ok) throw apiError("X finalize", finalized, finalData);
  let processing = finalData?.data?.processing_info;
  for (let attempt = 0; processing && !["succeeded", "failed"].includes(clean(processing.state).toLowerCase()) && attempt < 20; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, Math.max(1000, Number(processing.check_after_secs || 1) * 1000)));
    const status = await getJson(`https://api.x.com/2/media/upload?command=STATUS&media_id=${encodeURIComponent(mediaId)}`, auth);
    processing = status?.data?.processing_info;
  }
  if (processing && clean(processing.state).toLowerCase() === "failed") throw new Error("X media processing failed");
  return mediaId;
}

async function dispatchX(payload, env) {
  const token = clean(env.X_ACCESS_TOKEN);
  const media = await fetchMedia(payload.media_url);
  const mediaId = await uploadXVideo(media, token);
  const result = (await postJson("https://api.x.com/2/tweets", {
    text: clean(payload.caption).slice(0, 280),
    media: { media_ids: [mediaId] },
  }, { Authorization: `Bearer ${token}` })).data;
  return { provider: "x", post_id: result?.data?.id || "", media_id: mediaId, native_video: true };
}

function linkedinHeaders(env, includeJson = true) {
  return {
    Authorization: `Bearer ${clean(env.LINKEDIN_ACCESS_TOKEN)}`,
    "LinkedIn-Version": clean(env.LINKEDIN_VERSION),
    "X-Restli-Protocol-Version": "2.0.0",
    ...(includeJson ? { "Content-Type": "application/json" } : {}),
  };
}

async function uploadLinkedInVideo(payload, env) {
  const media = await fetchMedia(payload.media_url);
  const author = clean(env.LINKEDIN_ORGANIZATION_URN);
  const init = await postJson("https://api.linkedin.com/rest/videos?action=initializeUpload", {
    initializeUploadRequest: { owner: author, fileSizeBytes: media.bytes.length, uploadCaptions: false, uploadThumbnail: false },
  }, linkedinHeaders(env, false));
  const value = init.data?.value || {};
  const video = clean(value.video);
  const instructions = Array.isArray(value.uploadInstructions) ? value.uploadInstructions : [];
  if (!video || !instructions.length) throw new Error("LinkedIn initializeUpload incomplet");
  const uploadedPartIds = [];
  for (const instruction of instructions) {
    const first = Number(instruction.firstByte || 0);
    const last = Math.min(media.bytes.length - 1, Number(instruction.lastByte ?? (media.bytes.length - 1)));
    const part = media.bytes.subarray(first, last + 1);
    const response = await fetch(instruction.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream", "Content-Length": String(part.length) },
      body: part,
      cache: "no-store",
    });
    const body = await responseData(response);
    if (!response.ok) throw apiError("LinkedIn video part", response, body);
    const etag = clean(response.headers.get("etag")).replace(/^"|"$/g, "");
    if (!etag) throw new Error("LinkedIn upload sans ETag");
    uploadedPartIds.push(etag);
  }
  await postJson("https://api.linkedin.com/rest/videos?action=finalizeUpload", {
    finalizeUploadRequest: { video, uploadToken: value.uploadToken || "", uploadedPartIds },
  }, linkedinHeaders(env, false));
  return video;
}

async function dispatchLinkedIn(payload, env) {
  const author = clean(env.LINKEDIN_ORGANIZATION_URN);
  const video = await uploadLinkedInVideo(payload, env);
  const response = await fetch("https://api.linkedin.com/rest/posts", {
    method: "POST",
    headers: linkedinHeaders(env),
    body: JSON.stringify({
      author,
      commentary: clean(payload.caption).slice(0, 3000),
      visibility: "PUBLIC",
      distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
      content: { media: { title: (clean(payload.title) || "Le Hibou Rusé").slice(0, 200), id: video } },
      lifecycleState: "PUBLISHED",
      isReshareDisabledByAuthor: false,
    }),
    cache: "no-store",
  });
  const data = await responseData(response);
  if (!response.ok) throw apiError("LinkedIn post", response, data);
  return { provider: "linkedin", post_id: response.headers.get("x-restli-id") || data.id || "", video_urn: video, native_video: true };
}

function pinterestBase(env) {
  return flag(env.PINTEREST_SANDBOX, true) ? "https://api-sandbox.pinterest.com/v5" : "https://api.pinterest.com/v5";
}

function pinterestMediaKind(payload) {
  const explicit = clean(payload.metadata?.media_type).toLowerCase();
  if (["image", "video"].includes(explicit)) return explicit;
  try {
    const path = new URL(payload.media_url).pathname.toLowerCase();
    if (/\.(png|jpe?g|webp|gif)$/.test(path)) return "image";
  } catch {}
  return "video";
}

async function waitPinterestMedia(base, mediaId, headers, attempts = 30) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const state = await getJson(`${base}/media/${encodeURIComponent(mediaId)}`, headers);
    const status = clean(state.status || state.media_status).toLowerCase();
    if (["succeeded", "success", "ready"].includes(status)) return state;
    if (["failed", "error"].includes(status)) throw new Error(`Pinterest media ${status}`);
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error("Pinterest media toujours en traitement");
}

async function dispatchPinterest(payload, env) {
  const token = clean(env.PINTEREST_ACCESS_TOKEN);
  const boardId = clean(payload.metadata?.board_id) || clean(env.PINTEREST_BOARD_ID);
  if (!token) throw new Error("Pinterest access token absent");
  if (!boardId) throw new Error("Pinterest board_id absent");
  const sandbox = flag(env.PINTEREST_SANDBOX, true);
  const base = pinterestBase(env);
  const headers = { Authorization: `Bearer ${token}` };
  const common = {
    board_id: boardId,
    title: (clean(payload.title) || "Le Hibou Rusé").slice(0, 100),
    description: clean(payload.caption).slice(0, 800),
    ...(clean(payload.metadata?.link) ? { link: clean(payload.metadata.link) } : {}),
  };
  let created;
  if (pinterestMediaKind(payload) === "image") {
    created = (await postJson(`${base}/pins`, {
      ...common,
      media_source: { source_type: "image_url", url: assertMediaUrl(payload.media_url) },
    }, headers)).data;
  } else {
    if (sandbox) throw new Error("Pinterest Sandbox ne permet pas les video Pins ; utiliser une image ou attendre Standard Access");
    const coverImageUrl = clean(payload.metadata?.cover_image_url);
    if (!coverImageUrl) throw new Error("Pinterest vidéo requiert metadata.cover_image_url");
    const media = await fetchMedia(payload.media_url);
    const registered = (await postJson(`${base}/media`, { media_type: "video" }, headers)).data;
    const mediaId = clean(registered.media_id || registered.id);
    const uploadUrl = clean(registered.upload_url);
    const uploadParameters = registered.upload_parameters && typeof registered.upload_parameters === "object" ? registered.upload_parameters : {};
    if (!mediaId || !uploadUrl) throw new Error("Pinterest media registration incomplète");
    const form = new FormData();
    for (const [key, value] of Object.entries(uploadParameters)) form.append(key, String(value));
    form.append("file", new Blob([media.bytes], { type: media.contentType || "video/mp4" }), "hibou-pinterest.mp4");
    const upload = await fetch(uploadUrl, { method: "POST", body: form, cache: "no-store" });
    if (!upload.ok) throw new Error(`Pinterest media upload ${upload.status}: ${(await upload.text()).slice(0, 500)}`);
    await waitPinterestMedia(base, mediaId, headers);
    created = (await postJson(`${base}/pins`, {
      ...common,
      media_source: { source_type: "video_id", media_id: mediaId, cover_image_url: assertMediaUrl(coverImageUrl) },
    }, headers)).data;
  }
  const pinId = clean(created.id);
  if (!pinId) throw new Error("Pinterest n’a pas renvoyé de Pin id");
  return {
    provider: "pinterest", pin_id: pinId, sandbox,
    url: sandbox ? "" : `https://www.pinterest.com/pin/${encodeURIComponent(pinId)}/`,
  };
}

function blueskyBase(env = process.env) {
  const raw = clean(env.BLUESKY_PDS_URL) || "https://bsky.social";
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("BLUESKY_PDS_URL doit utiliser HTTPS");
  return url.origin;
}

function blueskyText(value) {
  return Array.from(clean(value)).slice(0, 300).join("");
}

async function createBlueskySession(env = process.env) {
  const identifier = clean(env.BLUESKY_IDENTIFIER);
  const password = clean(env.BLUESKY_APP_PASSWORD);
  if (!identifier || !password) throw new Error("Credentials Bluesky absents");
  const base = blueskyBase(env);
  const session = (await postJson(`${base}/xrpc/com.atproto.server.createSession`, { identifier, password })).data;
  if (!session?.accessJwt || !session?.did) throw new Error("Bluesky createSession incomplet");
  return { base, accessJwt: session.accessJwt, did: session.did, handle: clean(session.handle || identifier) };
}

async function dispatchBluesky(payload, env = process.env) {
  const session = await createBlueskySession(env);
  const record = {
    $type: "app.bsky.feed.post",
    text: blueskyText(payload.caption),
    createdAt: new Date().toISOString(),
  };

  if (clean(payload.media_url)) {
    const media = await fetchMedia(payload.media_url, 2 * 1024 * 1024);
    if (!/^image\//i.test(media.contentType)) throw new Error("Bluesky direct prend actuellement en charge le texte et les images uniquement");
    const response = await fetch(`${session.base}/xrpc/com.atproto.repo.uploadBlob`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${session.accessJwt}`,
        "Content-Type": media.contentType,
      },
      body: media.bytes,
      cache: "no-store",
    });
    const uploaded = await responseData(response);
    if (!response.ok) throw apiError("Bluesky uploadBlob", response, uploaded);
    if (!uploaded?.blob) throw new Error("Bluesky uploadBlob sans blob");
    record.embed = {
      $type: "app.bsky.embed.images",
      images: [{
        alt: clean(payload.metadata?.alt_text || payload.title || "Le Hibou Rusé").slice(0, 1000),
        image: uploaded.blob,
      }],
    };
  }

  if (!record.text && !record.embed) throw new Error("Bluesky requiert du texte ou une image");
  const created = (await postJson(`${session.base}/xrpc/com.atproto.repo.createRecord`, {
    repo: session.did,
    collection: "app.bsky.feed.post",
    record,
  }, { Authorization: `Bearer ${session.accessJwt}` })).data;
  const uri = clean(created?.uri);
  if (!uri) throw new Error("Bluesky n'a pas renvoyé d'URI de post");
  const rkey = uri.split("/").pop() || "";
  return {
    provider: "bluesky",
    post_id: uri,
    cid: clean(created?.cid),
    url: rkey ? `https://bsky.app/profile/${encodeURIComponent(session.handle)}/post/${encodeURIComponent(rkey)}` : "",
    handle: session.handle,
  };
}

async function dispatchDirect(provider, payload, env) {
  if (provider === "tiktok") return dispatchTikTok(payload, env);
  if (provider === "instagram") return dispatchInstagram(payload, env);
  if (provider === "facebook") return dispatchFacebook(payload, env);
  if (provider === "threads") return dispatchThreads(payload, env);
  if (provider === "youtube") return dispatchYouTube(payload, env);
  if (provider === "pinterest") return dispatchPinterest(payload, env);
  if (provider === "x") return dispatchX(payload, env);
  if (provider === "linkedin") return dispatchLinkedIn(payload, env);
  if (provider === "bluesky") return dispatchBluesky(payload, env);
  throw new Error(`${provider}: adaptateur direct non implémenté`);
}

export async function dispatchSocialPost(input, env = process.env) {
  const provider = assertProvider(input?.provider);
  const rawMediaUrl = clean(input?.media_url);
  if (!rawMediaUrl && provider !== "bluesky") throw new Error("media_url est requis pour ce réseau");
  const mediaUrl = rawMediaUrl ? assertMediaUrl(rawMediaUrl) : "";
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
  if (provider === "pinterest" && flag(env.PINTEREST_SANDBOX, true) && pinterestMediaKind(payload) === "video") {
    throw new Error("Pinterest Sandbox ne permet pas les video Pins ; utiliser une image ou attendre Standard Access");
  }
  if (input?.dry_run !== false) return { ok: true, dry_run: true, provider, gateway: status, payload };
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
