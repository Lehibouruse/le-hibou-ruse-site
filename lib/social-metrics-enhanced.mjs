import {
  contentMetricTargets as baseContentMetricTargets,
  fetchSocialMetrics as baseFetchSocialMetrics,
  performanceKey,
  selectMetricTargets,
} from "./social-metrics.mjs";
import { resolveSocialEnv } from "./social-credentials-runtime.mjs";

function clean(value) { return String(value ?? "").trim(); }
function count(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}
function scopeSet(scopes = "") { return new Set(String(scopes || "").split(/[ ,]+/).map((item) => item.trim()).filter(Boolean)); }
function needsReauth(message) { const error = new Error(message); error.code = "needs_reauth"; return error; }
function credentialMissing(message) { const error = new Error(message); error.code = "credential_missing"; return error; }

async function json(response, label, { optional = false } = {}) {
  const data = await response.json().catch(() => ({}));
  if (response.ok) return data;
  if (optional && response.status === 400) return null;
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

export async function fetchSocialMetrics(providerInput, externalId, baseEnv = process.env, fetchImpl = fetch) {
  const provider = clean(providerInput).toLowerCase();
  if (provider !== "facebook") return baseFetchSocialMetrics(provider, externalId, baseEnv, fetchImpl);
  const resolved = await resolveSocialEnv("facebook", baseEnv);
  return { ...(await fetchFacebookMetrics(externalId, resolved.env, fetchImpl, resolved.scopes || "")), credential_source: resolved.source };
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
