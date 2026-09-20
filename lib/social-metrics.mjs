import { resolveSocialEnv } from "./social-credentials-runtime.mjs";

function clean(value) { return String(value ?? "").trim(); }
function count(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}
function ratio(numerator, denominator) {
  const a = Number(numerator || 0);
  const b = Number(denominator || 0);
  return b > 0 && a >= 0 ? Math.max(0, Math.min(1, a / b)) : 0;
}
function scopeSet(scopes = "") {
  return new Set(String(scopes || "").split(/[ ,]+/).map((item) => item.trim()).filter(Boolean));
}
function requireScope(scopes, scope, provider) {
  if (!scopeSet(scopes).has(scope)) {
    const error = new Error(`${provider} scope ${scope} absent; reconnexion/approbation OAuth requise`);
    error.code = "needs_reauth";
    throw error;
  }
}
function credentialError(provider) {
  const error = new Error(`${provider} credential absent`);
  error.code = "credential_missing";
  return error;
}

export function normalizeYoutubeMetrics(item = {}) {
  const stats = item.statistics || {};
  return { provider: "youtube", external_id: clean(item.id), views: count(stats.viewCount), likes: count(stats.likeCount), comments: count(stats.commentCount), shares: 0, saves: 0, watch_time_seconds: 0, completion: 0, clicks: 0, followers_generated: 0 };
}

export function normalizeTikTokMetrics(item = {}) {
  return { provider: "tiktok", external_id: clean(item.id), views: count(item.view_count), likes: count(item.like_count), comments: count(item.comment_count), shares: count(item.share_count), saves: 0, watch_time_seconds: 0, completion: 0, clicks: 0, followers_generated: 0, url: clean(item.share_url) };
}

export function normalizeXMetrics(post = {}, media = {}) {
  const publicMetrics = post.public_metrics || {};
  const privateMetrics = post.non_public_metrics || {};
  const mediaPublic = media.public_metrics || {};
  const mediaPrivate = media.non_public_metrics || {};
  const playback0 = count(mediaPrivate.playback_0_count);
  return {
    provider: "x", external_id: clean(post.id), views: count(mediaPublic.view_count || publicMetrics.impression_count),
    likes: count(publicMetrics.like_count), comments: count(publicMetrics.reply_count), shares: count(publicMetrics.retweet_count) + count(publicMetrics.quote_count),
    saves: count(publicMetrics.bookmark_count), watch_time_seconds: 0, completion: ratio(mediaPrivate.playback_100_count, playback0),
    clicks: count(privateMetrics.url_link_clicks), followers_generated: 0, url: post.id ? `https://x.com/i/web/status/${post.id}` : "",
  };
}

function insightMap(data = []) {
  const map = new Map();
  for (const item of Array.isArray(data) ? data : []) {
    const raw = item?.values?.[0]?.value ?? item?.value ?? 0;
    map.set(clean(item?.name).toLowerCase(), typeof raw === "object" ? Number(raw?.value || 0) : Number(raw || 0));
  }
  return map;
}

export function normalizeThreadsMetrics(threadId, insights = [], thread = {}) {
  const m = insightMap(insights);
  return { provider: "threads", external_id: clean(threadId), views: count(m.get("views")), likes: count(m.get("likes")), comments: count(m.get("replies")), shares: count(m.get("reposts")) + count(m.get("quotes")) + count(m.get("shares")), saves: 0, watch_time_seconds: 0, completion: 0, clicks: 0, followers_generated: 0, url: clean(thread.permalink) };
}

export function normalizeInstagramMetrics(mediaId, insights = [], media = {}) {
  const m = insightMap(insights);
  return { provider: "instagram", external_id: clean(mediaId), views: count(m.get("views") || m.get("plays") || m.get("reach")), likes: count(media.like_count), comments: count(media.comments_count), shares: count(m.get("shares")), saves: count(m.get("saved")), watch_time_seconds: 0, completion: 0, clicks: 0, followers_generated: 0, url: clean(media.permalink) };
}

export function normalizeLinkedInMetrics(postUrn, values = {}, url = "") {
  return { provider: "linkedin", external_id: clean(postUrn), views: count(values.IMPRESSION), likes: count(values.REACTION), comments: count(values.COMMENT), shares: count(values.RESHARE), saves: count(values.POST_SAVE), watch_time_seconds: count(values.VIDEO_WATCH_TIME), completion: 0, clicks: count(values.LINK_CLICKS), followers_generated: count(values.FOLLOWER_GAINED_FROM_CONTENT), url: clean(url) };
}

function pinterestAnalyticsBucket(data = {}) {
  if (!data || typeof data !== "object") return {};
  const buckets = Object.values(data).filter((value) => value && typeof value === "object" && !Array.isArray(value));
  return buckets.find((value) => value.summary_metrics || value.lifetime_metrics || value.daily_metrics) || {};
}

export function normalizePinterestMetrics(pinId, analytics = {}) {
  const bucket = pinterestAnalyticsBucket(analytics);
  const summary = bucket.summary_metrics || {};
  const lifetime = bucket.lifetime_metrics || {};
  const metric = (name) => summary[name] ?? lifetime[name] ?? 0;
  const id = clean(pinId);
  return {
    provider: "pinterest",
    external_id: id,
    views: count(metric("IMPRESSION")),
    likes: 0,
    comments: 0,
    shares: 0,
    saves: count(metric("SAVE")),
    watch_time_seconds: 0,
    completion: 0,
    clicks: count(metric("OUTBOUND_CLICK")),
    followers_generated: 0,
    pin_clicks: count(metric("PIN_CLICK")),
    url: id ? `https://www.pinterest.com/pin/${encodeURIComponent(id)}/` : "",
  };
}

async function readJson(response, label) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.error?.message || data?.error?.code || data?.message || response.statusText || "unknown";
    const error = new Error(`${label} ${response.status}: ${String(detail).slice(0, 500)}`);
    error.status = response.status;
    if ([401, 403].includes(response.status)) error.code = "needs_reauth";
    throw error;
  }
  return data;
}

export async function fetchYoutubeMetrics(videoId, env = process.env, fetchImpl = fetch) {
  const id = clean(videoId); const token = clean(env.YOUTUBE_ACCESS_TOKEN);
  if (!id) throw new Error("YouTube external_id absent"); if (!token) throw credentialError("YouTube");
  const url = new URL("https://www.googleapis.com/youtube/v3/videos"); url.searchParams.set("part", "statistics"); url.searchParams.set("id", id);
  const data = await readJson(await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" }), "YouTube metrics");
  const item = data?.items?.[0]; if (!item) throw new Error(`YouTube video introuvable: ${id}`); return normalizeYoutubeMetrics(item);
}

export async function fetchTikTokMetrics(videoId, env = process.env, fetchImpl = fetch, scopes = "") {
  const id = clean(videoId); const token = clean(env.TIKTOK_ACCESS_TOKEN);
  if (!id) throw new Error("TikTok external_id absent"); if (!token) throw credentialError("TikTok"); requireScope(scopes, "video.list", "TikTok");
  const url = new URL("https://open.tiktokapis.com/v2/video/query/"); url.searchParams.set("fields", "id,share_url,like_count,comment_count,share_count,view_count");
  const data = await readJson(await fetchImpl(url, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ filters: { video_ids: [id] } }), cache: "no-store" }), "TikTok metrics");
  const item = data?.data?.videos?.[0]; if (!item) throw new Error(`TikTok video introuvable ou non autorisée: ${id}`); return normalizeTikTokMetrics(item);
}

export async function fetchXMetrics(postId, env = process.env, fetchImpl = fetch) {
  const id = clean(postId); const token = clean(env.X_ACCESS_TOKEN);
  if (!id) throw new Error("X external_id absent"); if (!token) throw credentialError("X");
  const buildUrl = (withPrivate) => { const url = new URL(`https://api.x.com/2/tweets/${encodeURIComponent(id)}`); url.searchParams.set("tweet.fields", `attachments,public_metrics${withPrivate ? ",non_public_metrics" : ""}`); url.searchParams.set("expansions", "attachments.media_keys"); url.searchParams.set("media.fields", `public_metrics${withPrivate ? ",non_public_metrics" : ""}`); return url; };
  let response = await fetchImpl(buildUrl(true), { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (response.status === 403) response = await fetchImpl(buildUrl(false), { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  const data = await readJson(response, "X metrics"); if (!data?.data) throw new Error(`X post introuvable: ${id}`);
  const media = Array.isArray(data?.includes?.media) ? data.includes.media.find((item) => item.type === "video") || data.includes.media[0] || {} : {};
  return normalizeXMetrics(data.data, media);
}

export async function fetchThreadsMetrics(threadId, env = process.env, fetchImpl = fetch, scopes = "") {
  const id = clean(threadId); const token = clean(env.THREADS_ACCESS_TOKEN);
  if (!id) throw new Error("Threads external_id absent"); if (!token) throw credentialError("Threads"); requireScope(scopes, "threads_manage_insights", "Threads");
  const insightsUrl = new URL(`https://graph.threads.net/${encodeURIComponent(id)}/insights`); insightsUrl.searchParams.set("metric", "views,likes,replies,reposts,quotes,shares"); insightsUrl.searchParams.set("access_token", token);
  const threadUrl = new URL(`https://graph.threads.net/${encodeURIComponent(id)}`); threadUrl.searchParams.set("fields", "id,permalink"); threadUrl.searchParams.set("access_token", token);
  const [insights, thread] = await Promise.all([readJson(await fetchImpl(insightsUrl, { cache: "no-store" }), "Threads insights"), readJson(await fetchImpl(threadUrl, { cache: "no-store" }), "Threads post")]);
  return normalizeThreadsMetrics(id, insights?.data || [], thread || {});
}

export async function fetchInstagramMetrics(mediaId, env = process.env, fetchImpl = fetch, scopes = "") {
  const id = clean(mediaId); const token = clean(env.INSTAGRAM_ACCESS_TOKEN); const version = clean(env.INSTAGRAM_GRAPH_VERSION) || "v26.0";
  if (!id) throw new Error("Instagram external_id absent"); if (!token) throw credentialError("Instagram"); requireScope(scopes, "instagram_business_manage_insights", "Instagram");
  const base = `https://graph.instagram.com/${version}`;
  const insightUrl = new URL(`${base}/${encodeURIComponent(id)}/insights`); insightUrl.searchParams.set("metric", "views,reach,saved,shares"); insightUrl.searchParams.set("access_token", token);
  const mediaUrl = new URL(`${base}/${encodeURIComponent(id)}`); mediaUrl.searchParams.set("fields", "id,permalink,like_count,comments_count"); mediaUrl.searchParams.set("access_token", token);
  const [insights, media] = await Promise.all([readJson(await fetchImpl(insightUrl, { cache: "no-store" }), "Instagram insights"), readJson(await fetchImpl(mediaUrl, { cache: "no-store" }), "Instagram media")]);
  return normalizeInstagramMetrics(id, insights?.data || [], media || {});
}

function linkedInEntity(urn) { const value = clean(urn); return value.includes(":ugcPost:") ? `(ugc:${encodeURIComponent(value)})` : `(share:${encodeURIComponent(value)})`; }
async function linkedInMetric(postUrn, metric, env, fetchImpl) {
  const version = clean(env.LINKEDIN_VERSION); const token = clean(env.LINKEDIN_ACCESS_TOKEN); if (!version || !token) throw credentialError("LinkedIn");
  const url = `https://api.linkedin.com/rest/memberCreatorPostAnalytics?q=entity&entity=${linkedInEntity(postUrn)}&queryType=${encodeURIComponent(metric)}&aggregation=TOTAL`;
  const data = await readJson(await fetchImpl(url, { headers: { Authorization: `Bearer ${token}`, "LinkedIn-Version": version, "X-Restli-Protocol-Version": "2.0.0", "Content-Type": "application/json" }, cache: "no-store" }), `LinkedIn ${metric}`);
  return count(data?.elements?.[0]?.count);
}
export async function fetchLinkedInMetrics(postUrn, env = process.env, fetchImpl = fetch, scopes = "") {
  const urn = clean(postUrn); if (!urn) throw new Error("LinkedIn external_id absent"); if (!clean(env.LINKEDIN_ACCESS_TOKEN)) throw credentialError("LinkedIn"); requireScope(scopes, "r_member_postAnalytics", "LinkedIn");
  const names = ["IMPRESSION", "RESHARE", "REACTION", "COMMENT", "POST_SAVE", "LINK_CLICKS", "FOLLOWER_GAINED_FROM_CONTENT"];
  const values = Object.fromEntries(await Promise.all(names.map(async (name) => [name, await linkedInMetric(urn, name, env, fetchImpl)])));
  return normalizeLinkedInMetrics(urn, values, `https://www.linkedin.com/feed/update/${encodeURIComponent(urn)}`);
}

function pinterestDateRange(now = new Date()) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 89);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export async function fetchPinterestMetrics(pinId, env = process.env, fetchImpl = fetch) {
  const id = clean(pinId); const token = clean(env.PINTEREST_ACCESS_TOKEN);
  if (!id) throw new Error("Pinterest external_id absent"); if (!token) throw credentialError("Pinterest");
  const { start, end } = pinterestDateRange();
  const url = new URL(`https://api.pinterest.com/v5/pins/${encodeURIComponent(id)}/analytics`);
  url.searchParams.set("start_date", start);
  url.searchParams.set("end_date", end);
  url.searchParams.set("metric_types", "IMPRESSION,SAVE,PIN_CLICK,OUTBOUND_CLICK");
  const data = await readJson(await fetchImpl(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }, cache: "no-store" }), "Pinterest metrics");
  return normalizePinterestMetrics(id, data);
}

export async function fetchSocialMetrics(providerInput, externalId, baseEnv = process.env, fetchImpl = fetch) {
  const provider = clean(providerInput).toLowerCase();
  if (!["youtube", "tiktok", "x", "threads", "instagram", "linkedin", "pinterest"].includes(provider)) { const error = new Error(`Métriques ${provider || "provider vide"} pas encore implémentées`); error.code = "unsupported_provider"; throw error; }
  const resolved = await resolveSocialEnv(provider, baseEnv);
  if (provider === "youtube") return { ...(await fetchYoutubeMetrics(externalId, resolved.env, fetchImpl)), credential_source: resolved.source };
  if (provider === "tiktok") return { ...(await fetchTikTokMetrics(externalId, resolved.env, fetchImpl, resolved.scopes || "")), credential_source: resolved.source };
  if (provider === "x") return { ...(await fetchXMetrics(externalId, resolved.env, fetchImpl)), credential_source: resolved.source };
  if (provider === "threads") return { ...(await fetchThreadsMetrics(externalId, resolved.env, fetchImpl, resolved.scopes || "")), credential_source: resolved.source };
  if (provider === "instagram") return { ...(await fetchInstagramMetrics(externalId, resolved.env, fetchImpl, resolved.scopes || "")), credential_source: resolved.source };
  if (provider === "pinterest") return { ...(await fetchPinterestMetrics(externalId, resolved.env, fetchImpl)), credential_source: resolved.source };
  return { ...(await fetchLinkedInMetrics(externalId, resolved.env, fetchImpl, resolved.scopes || "")), credential_source: resolved.source };
}

export function contentMetricTargets(record = {}) {
  const fields = record.fields || {};
  const defs = [["youtube", "ID YouTube", "URL YouTube"], ["tiktok", "ID TikTok", "URL TikTok"], ["instagram", "ID Instagram", "URL Instagram"], ["linkedin", "ID LinkedIn", "URL LinkedIn"], ["pinterest", "ID Pinterest", "URL Pinterest"], ["x", "ID X", "URL X"], ["threads", "ID Threads", "URL Threads"]];
  return defs.flatMap(([provider, idField, urlField]) => { const externalId = clean(fields[idField]); return externalId ? [{ provider, external_id: externalId, url: clean(fields[urlField]), content_record_id: record.id }] : []; });
}

export function performanceKey(provider, externalId) { return `${clean(provider).toLowerCase()}:${clean(externalId)}`; }

export function selectMetricTargets(targets = [], performanceRecords = [], limit = 6) {
  const captured = new Map(performanceRecords.map((record) => {
    const fields = record?.fields || {};
    return [clean(fields["Performance Key"]), Date.parse(fields["Captured At"] || "") || 0];
  }));
  return [...targets].sort((a, b) => {
    const aTime = captured.get(performanceKey(a.provider, a.external_id)) || 0;
    const bTime = captured.get(performanceKey(b.provider, b.external_id)) || 0;
    return aTime - bTime || performanceKey(a.provider, a.external_id).localeCompare(performanceKey(b.provider, b.external_id));
  }).slice(0, Math.max(1, Number(limit || 6)));
}
