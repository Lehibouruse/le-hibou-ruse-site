import {
  contentMetricTargets as baseContentMetricTargets,
  fetchSocialMetrics as baseFetchSocialMetrics,
  fetchYoutubeMetrics as baseFetchYoutubeMetrics,
  performanceKey,
  selectMetricTargets,
} from "./social-metrics.mjs";
import { resolveSocialEnv } from "./social-credentials-runtime.mjs";
import { fetchLinkedInOrganizationMetrics } from "./social-linkedin-org-metrics.mjs";

function clean(value) { return String(value ?? "").trim(); }
function count(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}
function boundedRatio(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
}
function scopeSet(scopes = "") { return new Set(String(scopes || "").split(/[ ,]+/).map((item) => item.trim()).filter(Boolean)); }
function needsReauth(message) { const error = new Error(message); error.code = "needs_reauth"; return error; }
function credentialMissing(message) { const error = new Error(message); error.code = "credential_missing"; return error; }

async function json(response, label, { optional = false } = {}) {
  const data = await response.json().catch(() => ({}));
  if (response.ok) return data;
  if (optional && [400, 403, 404].includes(response.status)) return null;
  const detail = data?.error?.message || data?.error?.code || data?.message || response.statusText || "unknown";
  const error = new Error(`${label} ${response.status}: ${String(detail).slice(0, 500)}`);
  error.status = response.status;
  if ([401, 403].includes(response.status)) error.code = "needs_reauth";
  throw error;
}

function insightValue(data) {
  const item = Array.isArray(data?.data) ? data.data[0] : null;
  const raw = item?.values?.[0]?.value ?? item?.value ?? 0;
  if (raw && typeof raw === "object") {
    return Object.values(raw).reduce((sum, value) => sum + (Number(value) || 0), 0);
  }
  return Number(raw || 0) || 0;
}

async function optionalFacebookInsight(base, id, token, metrics, fetchImpl) {
  for (const metric of metrics) {
    const url = new URL(`${base}/${encodeURIComponent(id)}/insights`);
    url.searchParams.set("metric", metric);
    url.searchParams.set("access_token", token);
    const response = await fetchImpl(url, { cache: "no-store" });
    const data = await json(response, `Facebook insight ${metric}`, { optional: true });
    if (data) return insightValue(data);
  }
  return 0;
}

export function normalizeFacebookMetrics(postId, post = {}, extras = {}) {
  const reactions = post?.reactions?.summary?.total_count ?? post?.likes?.summary?.total_count ?? 0;
  const comments = post?.comments?.summary?.total_count ?? 0;
  const shares = post?.shares?.count ?? 0;
  return {
    provider: "facebook",
    external_id: clean(postId),
    views: count(extras.views),
    likes: count(reactions),
    comments: count(comments),
    shares: count(shares),
    saves: 0,
    watch_time_seconds: 0,
    completion: 0,
    clicks: count(extras.clicks),
    followers_generated: 0,
    url: clean(post.permalink_url || post.permalink),
  };
}

export async function fetchFacebookMetrics(postId, env = process.env, fetchImpl = fetch, scopes = "") {
  const id = clean(postId);
  const token = clean(env.FACEBOOK_PAGE_ACCESS_TOKEN || env.META_ACCESS_TOKEN);
  const version = clean(env.META_GRAPH_VERSION);
  if (!id) throw new Error("Facebook external_id absent");
  if (!token || !version) throw credentialMissing("Facebook/Meta credential absent");
  const scopesSet = scopeSet(scopes);
  if (scopesSet.size && !scopesSet.has("pages_read_engagement")) throw needsReauth("Meta/Facebook scope pages_read_engagement absent; reconnexion/approbation OAuth requise");
  const base = `https://graph.facebook.com/${version}`;
  const postUrl = new URL(`${base}/${encodeURIComponent(id)}`);
  postUrl.searchParams.set("fields", "id,permalink_url,reactions.limit(0).summary(true),comments.limit(0).summary(true),shares");
  postUrl.searchParams.set("access_token", token);
  const post = await json(await fetchImpl(postUrl, { cache: "no-store" }), "Facebook post");
  const [views, clicks] = await Promise.all([
    optionalFacebookInsight(base, id, token, ["post_media_view", "post_video_views", "post_impressions"], fetchImpl),
    optionalFacebookInsight(base, id, token, ["post_clicks", "post_clicks_by_type"], fetchImpl),
  ]);
  return normalizeFacebookMetrics(id, post, { views, clicks });
}

function youtubeDateRange(env = process.env, now = new Date()) {
  const raw = Number(env.YOUTUBE_ANALYTICS_LOOKBACK_DAYS || 365);
  const days = Number.isFinite(raw) ? Math.max(7, Math.min(3650, Math.floor(raw))) : 365;
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - days);
  return { days, start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

function youtubeAnalyticsRow(data = {}) {
  const headers = Array.isArray(data.columnHeaders) ? data.columnHeaders : [];
  const row = Array.isArray(data.rows) && Array.isArray(data.rows[0]) ? data.rows[0] : [];
  return Object.fromEntries(headers.map((header, index) => [clean(header?.name), row[index]]));
}

export function mergeYoutubeAnalytics(basic = {}, analytics = null, lookbackDays = 365) {
  if (!analytics) return { ...basic, analytics_status: "unavailable", analytics_window_days: lookbackDays };
  const row = youtubeAnalyticsRow(analytics);
  return {
    ...basic,
    shares: count(row.shares ?? basic.shares),
    watch_time_seconds: Math.round((Number(row.estimatedMinutesWatched || 0) || 0) * 60),
    completion: boundedRatio((Number(row.averageViewPercentage || 0) || 0) / 100),
    followers_generated: count(row.subscribersGained),
    average_view_duration_seconds: Number(row.averageViewDuration || 0) || 0,
    analytics_views: count(row.views),
    analytics_status: "active",
    analytics_window_days: lookbackDays,
  };
}

export async function fetchYoutubeEnhancedMetrics(videoId, env = process.env, fetchImpl = fetch, scopes = "") {
  const id = clean(videoId);
  const token = clean(env.YOUTUBE_ACCESS_TOKEN);
  if (!id) throw new Error("YouTube external_id absent");
  if (!token) throw credentialMissing("YouTube credential absent");
  const basic = await baseFetchYoutubeMetrics(id, env, fetchImpl);
  const granted = scopeSet(scopes);
  const required = [
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/yt-analytics.readonly",
  ];
  const { days, start, end } = youtubeDateRange(env);
  if (granted.size && required.some((scope) => !granted.has(scope))) {
    return { ...basic, analytics_status: "scope_missing", analytics_window_days: days };
  }

  const url = new URL("https://youtubeanalytics.googleapis.com/v2/reports");
  url.searchParams.set("ids", "channel==MINE");
  url.searchParams.set("startDate", start);
  url.searchParams.set("endDate", end);
  url.searchParams.set("metrics", "views,estimatedMinutesWatched,averageViewDuration,averageViewPercentage,subscribersGained,shares");
  url.searchParams.set("filters", `video==${id}`);
  const response = await fetchImpl(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (response.status === 401) await json(response, "YouTube Analytics");
  const analytics = await json(response, "YouTube Analytics", { optional: true });
  return mergeYoutubeAnalytics(basic, analytics, days);
}

export async function fetchSocialMetrics(providerInput, externalId, baseEnv = process.env, fetchImpl = fetch) {
  const provider = clean(providerInput).toLowerCase();
  if (provider === "facebook") {
    const resolved = await resolveSocialEnv("facebook", baseEnv);
    return { ...(await fetchFacebookMetrics(externalId, resolved.env, fetchImpl, resolved.scopes || "")), credential_source: resolved.source };
  }
  if (provider === "youtube") {
    const resolved = await resolveSocialEnv("youtube", baseEnv);
    return { ...(await fetchYoutubeEnhancedMetrics(externalId, resolved.env, fetchImpl, resolved.scopes || "")), credential_source: resolved.source };
  }
  if (provider === "linkedin") {
    const resolved = await resolveSocialEnv("linkedin", baseEnv);
    if (clean(resolved.env?.LINKEDIN_ORGANIZATION_URN)) {
      return { ...(await fetchLinkedInOrganizationMetrics(externalId, resolved.env, fetchImpl, resolved.scopes || "")), credential_source: resolved.source };
    }
  }
  return baseFetchSocialMetrics(provider, externalId, baseEnv, fetchImpl);
}

export function contentMetricTargets(record = {}) {
  const targets = baseContentMetricTargets(record);
  const fields = record?.fields || {};
  const externalId = clean(fields["ID Facebook"]);
  if (externalId && !targets.some((item) => item.provider === "facebook")) {
    targets.push({ provider: "facebook", external_id: externalId, url: clean(fields["URL Facebook"]), content_record_id: record.id });
  }
  return targets;
}

export { performanceKey, selectMetricTargets };
