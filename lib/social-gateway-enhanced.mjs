import { dispatchSocialPost as dispatchBase, socialGatewayStatus as baseStatus } from "./social-gateway.mjs";

const MAX_IMAGE_BYTES = 50 * 1024 * 1024;

function clean(value) { return String(value ?? "").trim(); }
function flag(value, fallback = false) {
  if (value === true || value === false) return value;
  const normalized = clean(value).toLowerCase();
  if (["1", "true", "yes", "oui", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "non", "off"].includes(normalized)) return false;
  return fallback;
}
function httpsUrl(value, label = "URL") {
  const url = new URL(clean(value));
  if (url.protocol !== "https:") throw new Error(`${label} doit utiliser HTTPS`);
  return url.toString();
}
function mediaKind(input) {
  const explicit = clean(input?.metadata?.media_type || input?.media_type).toLowerCase();
  if (["image", "video", "text", "carousel"].includes(explicit)) return explicit;
  try {
    const path = new URL(clean(input?.media_url)).pathname.toLowerCase();
    if (/\.(png|jpe?g|webp|gif)$/.test(path)) return "image";
  } catch {}
  return clean(input?.media_url) ? "video" : "text";
}
function metaBase(env) {
  const version = clean(env.META_GRAPH_VERSION);
  return version ? `https://graph.facebook.com/${version}` : "https://graph.facebook.com";
}

function instagramBase(env) {
  const version = clean(env.INSTAGRAM_GRAPH_VERSION) || "v26.0";
  return `https://graph.instagram.com/${version}`;
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
async function postForm(url, fields, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers },
    body: new URLSearchParams(Object.entries(fields).filter(([, value]) => value !== undefined && value !== null && value !== "").map(([key, value]) => [key, String(value)])),
    cache: "no-store",
  });
  const data = await responseData(response);
  if (!response.ok) throw apiError("Social API", response, data);
  return { data, headers: response.headers };
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
async function getJson(url, headers = {}) {
  const response = await fetch(url, { headers, cache: "no-store" });
  const data = await responseData(response);
  if (!response.ok) throw apiError("Social API", response, data);
  return data;
}
async function fetchBinary(url, maxBytes = MAX_IMAGE_BYTES) {
  const response = await fetch(httpsUrl(url), { cache: "no-store" });
  if (!response.ok) throw new Error(`Téléchargement média ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!bytes.length) throw new Error("Média vide");
  if (bytes.length > maxBytes) throw new Error(`Média trop volumineux (${bytes.length} octets, max ${maxBytes})`);
  return { bytes, contentType: clean(response.headers.get("content-type")) || "application/octet-stream" };
}
async function waitMetaContainer(base, id, token, attempts = 20) {
  for (let i = 0; i < attempts; i += 1) {
    const state = await getJson(`${base}/${encodeURIComponent(id)}?fields=status_code,status&access_token=${encodeURIComponent(token)}`);
    const status = clean(state.status_code || state.status).toUpperCase();
    if (["FINISHED", "PUBLISHED"].includes(status)) return state;
    if (["ERROR", "EXPIRED"].includes(status)) throw new Error(`Meta container ${status}`);
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  throw new Error("Meta container toujours en traitement");
}
async function waitThreadsContainer(base, id, token, attempts = 20) {
  for (let i = 0; i < attempts; i += 1) {
    const state = await getJson(`${base}/${encodeURIComponent(id)}?fields=id,status,error_message&access_token=${encodeURIComponent(token)}`);
    const status = clean(state.status).toUpperCase();
    if (["FINISHED", "PUBLISHED"].includes(status)) return state;
    if (["ERROR", "EXPIRED"].includes(status)) throw new Error(`Threads container ${status}: ${clean(state.error_message)}`);
    await new Promise((resolve) => setTimeout(resolve, 2500));
  }
  throw new Error("Threads container toujours en traitement");
}

async function dispatchInstagramRich(input, env) {
  const token = clean(env.INSTAGRAM_ACCESS_TOKEN);
  const account = clean(env.INSTAGRAM_BUSINESS_ACCOUNT_ID);
  if (!token || !account) throw new Error("Instagram direct non configuré");
  const base = instagramBase(env);
  const caption = clean(input.caption).slice(0, 2200);
  const urls = [clean(input.media_url), ...(Array.isArray(input.metadata?.media_urls) ? input.metadata.media_urls.map(clean) : [])].filter(Boolean);
  const unique = [...new Set(urls)].map((url) => httpsUrl(url, "Instagram media_url"));
  const kind = mediaKind(input);

  if (kind === "carousel" || unique.length > 1) {
    if (unique.length < 2 || unique.length > 10) throw new Error("Instagram carousel requiert 2 à 10 médias");
    const children = [];
    for (const url of unique) {
      const child = (await postForm(`${base}/${account}/media`, { image_url: url, is_carousel_item: "true", access_token: token })).data;
      if (!child.id) throw new Error("Instagram n'a pas renvoyé un container enfant");
      await waitMetaContainer(base, child.id, token);
      children.push(child.id);
    }
    const parent = (await postForm(`${base}/${account}/media`, {
      media_type: "CAROUSEL",
      children: children.join(","),
      caption,
      access_token: token,
    })).data;
    if (!parent.id) throw new Error("Instagram n'a pas renvoyé de container carousel");
    await waitMetaContainer(base, parent.id, token);
    const published = (await postForm(`${base}/${account}/media_publish`, { creation_id: parent.id, access_token: token })).data;
    return { provider: "instagram", media_id: clean(published.id), container_id: parent.id, media_type: "carousel", child_count: children.length };
  }

  if (kind !== "image") return dispatchBase(input, env);
  const created = (await postForm(`${base}/${account}/media`, { image_url: httpsUrl(input.media_url, "Instagram image"), caption, access_token: token })).data;
  if (!created.id) throw new Error("Instagram n'a pas renvoyé de container image");
  await waitMetaContainer(base, created.id, token);
  const published = (await postForm(`${base}/${account}/media_publish`, { creation_id: created.id, access_token: token })).data;
  return { provider: "instagram", media_id: clean(published.id), container_id: created.id, media_type: "image" };
}

async function dispatchFacebookRich(input, env) {
  const token = clean(env.FACEBOOK_PAGE_ACCESS_TOKEN) || clean(env.META_ACCESS_TOKEN);
  const pageId = clean(env.FACEBOOK_PAGE_ID);
  if (!token || !pageId) throw new Error("Facebook direct non configuré");
  const base = metaBase(env);
  const kind = mediaKind(input);
  const facebookType = clean(input.metadata?.facebook_type || input.metadata?.post_type).toLowerCase();

  if (kind === "image") {
    const photo = (await postForm(`${base}/${pageId}/photos`, {
      url: httpsUrl(input.media_url, "Facebook image"),
      caption: clean(input.caption).slice(0, 5000),
      published: "true",
      access_token: token,
    })).data;
    return { provider: "facebook", post_id: clean(photo.post_id || photo.id), photo_id: clean(photo.id), media_type: "image" };
  }

  if (facebookType !== "reel") return dispatchBase(input, env);
  const started = (await postForm(`${base}/${pageId}/video_reels`, { access_token: token, upload_phase: "start" })).data;
  const videoId = clean(started.video_id);
  const uploadUrl = clean(started.upload_url);
  if (!videoId || !uploadUrl) throw new Error("Facebook Reel initialization incomplète");
  const upload = await fetch(uploadUrl, {
    method: "POST",
    headers: { Authorization: `OAuth ${token}`, file_url: httpsUrl(input.media_url, "Facebook Reel") },
    cache: "no-store",
  });
  const uploadData = await responseData(upload);
  if (!upload.ok) throw apiError("Facebook Reel upload", upload, uploadData);
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const state = await getJson(`${base}/${encodeURIComponent(videoId)}?fields=status&access_token=${encodeURIComponent(token)}`);
    const uploading = clean(state?.status?.uploading_phase?.status).toLowerCase();
    if (["complete", "completed"].includes(uploading)) break;
    if (["error", "failed"].includes(uploading)) throw new Error("Facebook Reel upload failed");
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  const finished = (await postForm(`${base}/${pageId}/video_reels`, {
    access_token: token,
    video_id: videoId,
    upload_phase: "finish",
    video_state: "PUBLISHED",
    description: clean(input.caption).slice(0, 5000),
    title: clean(input.title).slice(0, 255),
  })).data;
  if (finished.success !== true && !finished.id) throw new Error("Facebook Reel finish non confirmé");
  return { provider: "facebook", video_id: videoId, post_id: videoId, media_type: "reel" };
}

async function dispatchThreadsRich(input, env) {
  const kind = mediaKind(input);
  if (kind === "video") return dispatchBase(input, env);
  const token = clean(env.THREADS_ACCESS_TOKEN);
  const userId = clean(env.THREADS_USER_ID);
  const version = clean(env.THREADS_API_VERSION) || "v1.0";
  if (!token || !userId) throw new Error("Threads direct non configuré");
  const base = `https://graph.threads.net/${version}`;
  const fields = { text: clean(input.caption).slice(0, 500), access_token: token };
  if (kind === "image") {
    fields.media_type = "IMAGE";
    fields.image_url = httpsUrl(input.media_url, "Threads image");
  } else {
    fields.media_type = "TEXT";
  }
  const created = (await postForm(`${base}/${userId}/threads`, fields)).data;
  if (!created.id) throw new Error("Threads n'a pas renvoyé de container id");
  await waitThreadsContainer(base, created.id, token);
  const published = (await postForm(`${base}/${userId}/threads_publish`, { creation_id: created.id, access_token: token })).data;
  return { provider: "threads", thread_id: clean(published.id), container_id: created.id, media_type: kind };
}

function linkedinHeaders(env, includeJson = true) {
  return {
    Authorization: `Bearer ${clean(env.LINKEDIN_ACCESS_TOKEN)}`,
    "LinkedIn-Version": clean(env.LINKEDIN_VERSION),
    "X-Restli-Protocol-Version": "2.0.0",
    ...(includeJson ? { "Content-Type": "application/json" } : {}),
  };
}
function linkedinAuthor(input, env) {
  return clean(input.metadata?.author_urn) || clean(env.LINKEDIN_ORGANIZATION_URN) || clean(env.LINKEDIN_AUTHOR_URN);
}
async function createLinkedInPost(input, env, content) {
  const author = linkedinAuthor(input, env);
  if (!author) throw new Error("LinkedIn author URN absent");
  const body = {
    author,
    commentary: clean(input.caption).slice(0, 3000),
    visibility: "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    ...(content ? { content } : {}),
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
  const response = await fetch("https://api.linkedin.com/rest/posts", { method: "POST", headers: linkedinHeaders(env), body: JSON.stringify(body), cache: "no-store" });
  const data = await responseData(response);
  if (!response.ok) throw apiError("LinkedIn post", response, data);
  return { post_id: clean(response.headers.get("x-restli-id") || data.id), author };
}
async function uploadLinkedInImage(input, env) {
  const author = linkedinAuthor(input, env);
  const media = await fetchBinary(input.media_url, MAX_IMAGE_BYTES);
  const init = await postJson("https://api.linkedin.com/rest/images?action=initializeUpload", { initializeUploadRequest: { owner: author } }, linkedinHeaders(env));
  const value = init.data?.value || {};
  const uploadUrl = clean(value.uploadUrl);
  const image = clean(value.image);
  if (!uploadUrl || !image) throw new Error("LinkedIn image initializeUpload incomplet");
  const upload = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": media.contentType, "Content-Length": String(media.bytes.length) }, body: media.bytes, cache: "no-store" });
  const uploadData = await responseData(upload);
  if (!upload.ok) throw apiError("LinkedIn image upload", upload, uploadData);
  return image;
}
async function dispatchLinkedInRich(input, env) {
  const author = linkedinAuthor(input, env);
  const overridden = author ? { ...env, LINKEDIN_AUTHOR_URN: author } : env;
  const kind = mediaKind(input);
  if (kind === "video") return dispatchBase(input, overridden);
  if (kind === "text") {
    const created = await createLinkedInPost(input, overridden, null);
    return { provider: "linkedin", ...created, media_type: "text" };
  }
  if (kind !== "image") return dispatchBase(input, overridden);
  const image = await uploadLinkedInImage(input, overridden);
  const created = await createLinkedInPost(input, overridden, { media: { id: image, ...(clean(input.metadata?.alt_text) ? { altText: clean(input.metadata.alt_text).slice(0, 4086) } : {}) } });
  return { provider: "linkedin", ...created, image_urn: image, media_type: "image" };
}

async function setYouTubeThumbnail(videoId, thumbnailUrl, token) {
  const media = await fetchBinary(thumbnailUrl, MAX_IMAGE_BYTES);
  const allowed = ["image/jpeg", "image/png", "application/octet-stream"];
  const contentType = allowed.includes(media.contentType.split(";")[0].toLowerCase()) ? media.contentType.split(";")[0].toLowerCase() : "application/octet-stream";
  const endpoint = new URL("https://www.googleapis.com/upload/youtube/v3/thumbnails/set");
  endpoint.searchParams.set("videoId", videoId);
  endpoint.searchParams.set("uploadType", "media");
  const response = await fetch(endpoint, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType, "Content-Length": String(media.bytes.length) }, body: media.bytes, cache: "no-store" });
  const data = await responseData(response);
  if (!response.ok) throw apiError("YouTube thumbnail", response, data);
  return data;
}
async function resolveYouTubeToken(env) {
  if (clean(env.YOUTUBE_ACCESS_TOKEN)) return clean(env.YOUTUBE_ACCESS_TOKEN);
  if (!clean(env.YOUTUBE_REFRESH_TOKEN) || !clean(env.YOUTUBE_CLIENT_ID) || !clean(env.YOUTUBE_CLIENT_SECRET)) return "";
  const refreshed = await postForm("https://oauth2.googleapis.com/token", {
    client_id: env.YOUTUBE_CLIENT_ID,
    client_secret: env.YOUTUBE_CLIENT_SECRET,
    refresh_token: env.YOUTUBE_REFRESH_TOKEN,
    grant_type: "refresh_token",
  });
  return clean(refreshed.data.access_token);
}
async function dispatchYouTubeEnhanced(input, env) {
  const result = await dispatchBase(input, env);
  const thumbnailUrl = clean(input.thumbnail_url || input.metadata?.thumbnail_url || input.metadata?.video_thumbnail_url);
  const videoId = clean(result?.result?.video_id);
  if (!thumbnailUrl || !videoId || result.dry_run === true) return result;
  try {
    const token = await resolveYouTubeToken(env);
    if (!token) throw new Error("YouTube access token absent pour miniature");
    const thumbnail = await setYouTubeThumbnail(videoId, thumbnailUrl, token);
    return { ...result, result: { ...result.result, thumbnail_set: true, thumbnail_count: Array.isArray(thumbnail.items) ? thumbnail.items.length : 0 } };
  } catch (error) {
    return { ...result, result: { ...result.result, thumbnail_set: false, thumbnail_error: String(error?.message || error).slice(0, 800) } };
  }
}

export function socialGatewayStatus(env = process.env) {
  return baseStatus(env).map((item) => ({
    ...item,
    direct_capabilities: item.provider === "instagram"
      ? ["video_native", "image_native", "carousel_images"]
      : item.provider === "facebook"
        ? ["video_native", "image_native", "reel_native"]
        : item.provider === "threads"
          ? ["video_native", "image_native", "text_native"]
          : item.provider === "linkedin"
            ? ["video_native", "image_native", "text_native", "organization_author"]
            : item.provider === "youtube"
              ? ["video_native", "custom_thumbnail"]
              : item.direct_capabilities,
  }));
}

export async function dispatchSocialPost(input, env = process.env) {
  const provider = clean(input?.provider).toLowerCase();
  const plan = socialGatewayStatus(env).find((item) => item.provider === provider);
  if (input?.dry_run !== false) {
    if (clean(input?.media_url)) return dispatchBase(input, env);
    return { ok: true, dry_run: true, provider, gateway: plan, payload: { caption: clean(input?.caption), metadata: input?.metadata || {} } };
  }
  if (plan?.mode !== "direct") return dispatchBase(input, env);
  if (provider === "instagram") {
    const result = await dispatchInstagramRich(input, env);
    if (result?.ok !== undefined) return result;
    return { ok: true, dry_run: false, provider, mode: "direct", result };
  }
  if (provider === "facebook") {
    const result = await dispatchFacebookRich(input, env);
    if (result?.ok !== undefined) return result;
    return { ok: true, dry_run: false, provider, mode: "direct", result };
  }
  if (provider === "threads") {
    const result = await dispatchThreadsRich(input, env);
    if (result?.ok !== undefined) return result;
    return { ok: true, dry_run: false, provider, mode: "direct", result };
  }
  if (provider === "linkedin") {
    const result = await dispatchLinkedInRich(input, env);
    if (result?.ok !== undefined) return result;
    return { ok: true, dry_run: false, provider, mode: "direct", result };
  }
  if (provider === "youtube") return dispatchYouTubeEnhanced(input, env);
  return dispatchBase(input, env);
}
