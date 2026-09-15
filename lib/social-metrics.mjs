import { resolveSocialEnv } from "./social-credentials-runtime.mjs";

function clean(value) { return String(value ?? "").trim(); }
function count(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}

export function normalizeYoutubeMetrics(item = {}) {
  const stats = item.statistics || {};
  return {
    provider: "youtube",
    external_id: clean(item.id),
    views: count(stats.viewCount),
    likes: count(stats.likeCount),
    comments: count(stats.commentCount),
    shares: 0,
    saves: 0,
  };
}

export function normalizeTikTokMetrics(item = {}) {
  return {
    provider: "tiktok",
    external_id: clean(item.id),
    views: count(item.view_count),
    likes: count(item.like_count),
    comments: count(item.comment_count),
    shares: count(item.share_count),
    saves: 0,
    url: clean(item.share_url),
  };
}

async function readJson(response, label) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.error?.message || data?.error?.code || data?.message || response.statusText || "unknown";
    const error = new Error(`${label} ${response.status}: ${String(detail).slice(0, 500)}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

export async function fetchYoutubeMetrics(videoId, env = process.env, fetchImpl = fetch) {
  const id = clean(videoId);
  const token = clean(env.YOUTUBE_ACCESS_TOKEN);
  if (!id) throw new Error("YouTube external_id absent");
  if (!token) {
    const error = new Error("YouTube credential absent");
    error.code = "credential_missing";
    throw error;
  }
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("part", "statistics");
  url.searchParams.set("id", id);
  const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  const data = await readJson(response, "YouTube metrics");
  const item = data?.items?.[0];
  if (!item) throw new Error(`YouTube video introuvable: ${id}`);
  return normalizeYoutubeMetrics(item);
}

export async function fetchTikTokMetrics(videoId, env = process.env, fetchImpl = fetch, scopes = "") {
  const id = clean(videoId);
  const token = clean(env.TIKTOK_ACCESS_TOKEN);
  if (!id) throw new Error("TikTok external_id absent");
  if (!token) {
    const error = new Error("TikTok credential absent");
    error.code = "credential_missing";
    throw error;
  }
  if (scopes && !String(scopes).split(/[ ,]+/).includes("video.list")) {
    const error = new Error("TikTok scope video.list absent; reconnexion OAuth requise pour lire les performances");
    error.code = "needs_reauth";
    throw error;
  }
  const url = new URL("https://open.tiktokapis.com/v2/video/query/");
  url.searchParams.set("fields", "id,share_url,like_count,comment_count,share_count,view_count");
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ filters: { video_ids: [id] } }),
    cache: "no-store",
  });
  const data = await readJson(response, "TikTok metrics");
  const item = data?.data?.videos?.[0];
  if (!item) throw new Error(`TikTok video introuvable ou non autorisée: ${id}`);
  return normalizeTikTokMetrics(item);
}

export async function fetchSocialMetrics(providerInput, externalId, baseEnv = process.env, fetchImpl = fetch) {
  const provider = clean(providerInput).toLowerCase();
  if (!["youtube", "tiktok"].includes(provider)) {
    const error = new Error(`Métriques ${provider || "provider vide"} pas encore implémentées`);
    error.code = "unsupported_provider";
    throw error;
  }
  const resolved = await resolveSocialEnv(provider, baseEnv);
  if (provider === "youtube") {
    const metrics = await fetchYoutubeMetrics(externalId, resolved.env, fetchImpl);
    return { ...metrics, credential_source: resolved.source };
  }
  const metrics = await fetchTikTokMetrics(externalId, resolved.env, fetchImpl, resolved.scopes || "");
  return { ...metrics, credential_source: resolved.source };
}

export function contentMetricTargets(record = {}) {
  const fields = record.fields || {};
  const targets = [];
  const youtubeId = clean(fields["ID YouTube"]);
  const tiktokId = clean(fields["ID TikTok"]);
  if (youtubeId) targets.push({ provider: "youtube", external_id: youtubeId, url: clean(fields["URL YouTube"]), content_record_id: record.id });
  if (tiktokId) targets.push({ provider: "tiktok", external_id: tiktokId, url: clean(fields["URL TikTok"]), content_record_id: record.id });
  return targets;
}

export function performanceKey(provider, externalId) {
  return `${clean(provider).toLowerCase()}:${clean(externalId)}`;
}
