function clean(value) { return String(value ?? "").trim(); }
function count(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}
function scopeSet(scopes = "") {
  return new Set(String(scopes || "").split(/[\s,]+/).map((item) => item.trim()).filter(Boolean));
}
function needsReauth(message) {
  const error = new Error(message);
  error.code = "needs_reauth";
  return error;
}
function credentialMissing(message) {
  const error = new Error(message);
  error.code = "credential_missing";
  return error;
}

async function responseJson(response) {
  return response.json().catch(() => ({}));
}

function redact(value, secret = "") {
  const text = String(value ?? "");
  return secret ? text.split(secret).join("[redacted]") : text;
}

function apiError(label, response, data = {}, secret = "") {
  const detail = data?.error?.message || data?.error?.code || data?.message || response.statusText || "unknown";
  const error = new Error(`${label} ${response.status}: ${redact(detail, secret).slice(0, 500)}`);
  error.status = response.status;
  if ([401, 403].includes(response.status)) error.code = "needs_reauth";
  return error;
}

async function requiredJson(response, label, secret = "") {
  const data = await responseJson(response);
  if (!response.ok) throw apiError(label, response, data, secret);
  return data;
}

function insightValue(payload = {}) {
  const item = Array.isArray(payload?.data) ? payload.data[0] : null;
  const raw = item?.values?.[0]?.value ?? item?.value ?? null;
  if (raw === null || raw === undefined) return null;
  if (raw && typeof raw === "object") {
    return Object.values(raw).reduce((sum, value) => sum + (Number(value) || 0), 0);
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

async function optionalInsightMetric(base, mediaId, token, metric, fetchImpl) {
  const url = new URL(`${base}/${encodeURIComponent(mediaId)}/insights`);
  url.searchParams.set("metric", metric);
  const response = await fetchImpl(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  const data = await responseJson(response);
  if (response.ok) return { metric, value: insightValue(data), available: true };
  if ([400, 404].includes(response.status)) return { metric, value: null, available: false };
  throw apiError(`Instagram insight ${metric}`, response, data, token);
}

async function firstAvailableMetric(base, mediaId, token, metrics, fetchImpl) {
  for (const metric of metrics) {
    const result = await optionalInsightMetric(base, mediaId, token, metric, fetchImpl);
    if (result.available && result.value !== null) return result;
  }
  return { metric: "", value: null, available: false };
}

export function normalizeInstagramEnhancedMetrics(mediaId, media = {}, insights = {}) {
  const likes = count(media.like_count);
  const comments = count(media.comments_count);
  const shares = count(insights.shares);
  const saves = count(insights.saved);
  const apiInteractions = insights.total_interactions;
  const totalInteractions = apiInteractions === null || apiInteractions === undefined
    ? likes + comments + shares + saves
    : count(apiInteractions);
  const available = Array.isArray(insights.available_metrics) ? insights.available_metrics.filter(Boolean) : [];
  return {
    provider: "instagram",
    external_id: clean(mediaId),
    views: count(insights.views),
    likes,
    comments,
    shares,
    saves,
    watch_time_seconds: 0,
    completion: 0,
    clicks: 0,
    followers_generated: 0,
    reach: count(insights.reach),
    total_interactions: totalInteractions,
    media_type: clean(media.media_type),
    media_product_type: clean(media.media_product_type),
    analytics_status: available.length ? "active" : "unavailable",
    analytics_metrics: available,
    url: clean(media.permalink),
  };
}

export async function fetchInstagramEnhancedMetrics(mediaId, env = process.env, fetchImpl = fetch, scopes = "") {
  const id = clean(mediaId);
  const token = clean(env.INSTAGRAM_ACCESS_TOKEN);
  const version = clean(env.INSTAGRAM_GRAPH_VERSION) || "v26.0";
  if (!id) throw new Error("Instagram external_id absent");
  if (!token) throw credentialMissing("Instagram credential absent");

  const granted = scopeSet(scopes);
  if (granted.size) {
    const required = ["instagram_business_manage_insights"];
    const missing = required.filter((scope) => !granted.has(scope));
    if (missing.length) throw needsReauth(`Instagram scopes analytics absents: ${missing.join(", ")}; reconnexion/approbation OAuth requise`);
  }

  const base = `https://graph.instagram.com/${version}`;
  const mediaUrl = new URL(`${base}/${encodeURIComponent(id)}`);
  mediaUrl.searchParams.set("fields", "id,permalink,like_count,comments_count,media_type,media_product_type");
  const media = await requiredJson(await fetchImpl(mediaUrl, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  }), "Instagram media", token);

  const viewsResult = await firstAvailableMetric(base, id, token, ["views", "plays", "reach"], fetchImpl);
  const [reachResult, savedResult, sharesResult, interactionsResult] = await Promise.all([
    optionalInsightMetric(base, id, token, "reach", fetchImpl),
    optionalInsightMetric(base, id, token, "saved", fetchImpl),
    optionalInsightMetric(base, id, token, "shares", fetchImpl),
    optionalInsightMetric(base, id, token, "total_interactions", fetchImpl),
  ]);

  const results = [viewsResult, reachResult, savedResult, sharesResult, interactionsResult];
  const availableMetrics = [...new Set(results.filter((item) => item.available).map((item) => item.metric).filter(Boolean))];
  return normalizeInstagramEnhancedMetrics(id, media, {
    views: viewsResult.value,
    reach: reachResult.value,
    saved: savedResult.value,
    shares: sharesResult.value,
    total_interactions: interactionsResult.value,
    available_metrics: availableMetrics,
  });
}
