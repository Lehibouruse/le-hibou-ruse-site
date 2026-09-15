function clean(value) { return String(value ?? "").trim(); }
function flag(value, fallback = false) {
  if (value === true || value === false) return value;
  const normalized = clean(value).toLowerCase();
  if (["1", "true", "yes", "oui", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "non", "off"].includes(normalized)) return false;
  return fallback;
}
function httpsUrl(value) {
  const url = new URL(clean(value));
  if (url.protocol !== "https:") throw new Error("TikTok photo URL doit utiliser HTTPS");
  return url.toString();
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
  if (!response.ok) throw apiError("TikTok API", response, data);
  if (data?.error?.code && data.error.code !== "ok") throw new Error(`TikTok API: ${String(data.error.message || data.error.code).slice(0, 800)}`);
  return data;
}
async function tokenForm(url, fields) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(Object.entries(fields).map(([key, value]) => [key, String(value)])),
    cache: "no-store",
  });
  const data = await responseData(response);
  if (!response.ok || !data.access_token) throw apiError("TikTok refresh", response, data);
  return data.access_token;
}
async function resolveTikTokToken(env = process.env) {
  if (clean(env.TIKTOK_ACCESS_TOKEN)) return clean(env.TIKTOK_ACCESS_TOKEN);
  if (!clean(env.TIKTOK_REFRESH_TOKEN) || !clean(env.TIKTOK_CLIENT_KEY) || !clean(env.TIKTOK_CLIENT_SECRET)) {
    throw new Error("TikTok credentials absents");
  }
  return tokenForm("https://open.tiktokapis.com/v2/oauth/token/", {
    client_key: env.TIKTOK_CLIENT_KEY,
    client_secret: env.TIKTOK_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: env.TIKTOK_REFRESH_TOKEN,
  });
}

export function tiktokPhotoUrls(input = {}) {
  const values = [clean(input.media_url), ...(Array.isArray(input.metadata?.media_urls) ? input.metadata.media_urls.map(clean) : [])].filter(Boolean);
  const unique = [...new Set(values)].map(httpsUrl);
  if (!unique.length) throw new Error("TikTok photo requiert au moins une image");
  if (unique.length > 35) throw new Error("TikTok photo accepte au maximum 35 images");
  return unique;
}

export function tiktokPhotoPostBody(input = {}, creator = {}, env = process.env) {
  const images = tiktokPhotoUrls(input);
  const options = Array.isArray(creator?.privacy_level_options) ? creator.privacy_level_options : [];
  const audited = flag(env.TIKTOK_APP_AUDITED, false);
  const requested = clean(input.privacy_level) || "SELF_ONLY";
  const desired = audited ? requested : "SELF_ONLY";
  const privacy = options.includes(desired) ? desired : options.includes("SELF_ONLY") ? "SELF_ONLY" : options[0];
  if (!privacy) throw new Error("TikTok ne renvoie aucun niveau de confidentialité autorisé");
  if (!audited && privacy !== "SELF_ONLY") throw new Error("TikTok direct public refusé avant audit de l'application");
  const coverRaw = Number(input.metadata?.photo_cover_index ?? 0);
  const cover = Number.isInteger(coverRaw) && coverRaw >= 0 && coverRaw < images.length ? coverRaw : 0;
  return {
    post_info: {
      title: (clean(input.title) || "Le Hibou Rusé").slice(0, 90),
      description: clean(input.caption).slice(0, 4000),
      privacy_level: privacy,
      disable_comment: Boolean(input.disable_comment || creator.comment_disabled),
      auto_add_music: input.metadata?.auto_add_music === true,
      brand_content_toggle: input.metadata?.brand_content_toggle === true,
      brand_organic_toggle: input.brand_organic_toggle !== false,
    },
    source_info: {
      source: "PULL_FROM_URL",
      photo_images: images,
      photo_cover_index: cover,
    },
    post_mode: "DIRECT_POST",
    media_type: "PHOTO",
  };
}

export async function dispatchTikTokPhoto(input = {}, env = process.env) {
  const token = await resolveTikTokToken(env);
  const headers = { Authorization: `Bearer ${token}` };
  const creatorEnvelope = await postJson("https://open.tiktokapis.com/v2/post/publish/creator_info/query/", {}, headers);
  const creator = creatorEnvelope?.data || {};
  const body = tiktokPhotoPostBody(input, creator, env);
  const initialized = await postJson("https://open.tiktokapis.com/v2/post/publish/content/init/", body, headers);
  const publishId = clean(initialized?.data?.publish_id);
  if (!publishId) throw new Error("TikTok photo init sans publish_id");
  return {
    provider: "tiktok",
    publish_id: publishId,
    media_type: "photo",
    photo_count: body.source_info.photo_images.length,
    privacy_level: body.post_info.privacy_level,
    audited: flag(env.TIKTOK_APP_AUDITED, false),
    creator_username: clean(creator.creator_username),
  };
}
