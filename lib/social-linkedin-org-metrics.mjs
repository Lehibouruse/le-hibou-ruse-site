function clean(value) { return String(value ?? "").trim(); }
function count(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
}
function ratio(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}
function scopes(value = "") {
  return new Set(String(value || "").split(/[ ,]+/).map((item) => item.trim()).filter(Boolean));
}
function missingCredential(message) {
  const error = new Error(message);
  error.code = "credential_missing";
  return error;
}
function missingScope(scope) {
  const error = new Error(`LinkedIn scope ${scope} absent; accès Community Management/OAuth organisation requis`);
  error.code = "needs_reauth";
  return error;
}

function postSelector(postUrn) {
  const urn = clean(postUrn);
  if (urn.includes(":ugcPost:")) return `ugcPosts[0]=${encodeURIComponent(urn)}`;
  if (urn.includes(":share:")) return `shares=List(${encodeURIComponent(urn)})`;
  throw new Error("LinkedIn external_id doit être un URN urn:li:share:* ou urn:li:ugcPost:*");
}

export function linkedInOrganizationStatisticsUrl(postUrn, organizationUrn) {
  const org = clean(organizationUrn);
  if (!/^urn:li:(organization|organizationBrand):[^:]+$/.test(org)) {
    throw new Error("LINKEDIN_ORGANIZATION_URN invalide");
  }
  return `https://api.linkedin.com/rest/organizationalEntityShareStatistics?q=organizationalEntity&organizationalEntity=${encodeURIComponent(org)}&${postSelector(postUrn)}`;
}

export function normalizeLinkedInOrganizationMetrics(postUrn, response = {}) {
  const element = Array.isArray(response?.elements) ? response.elements[0] : null;
  const stats = element?.totalShareStatistics || {};
  const id = clean(postUrn);
  return {
    provider: "linkedin",
    external_id: id,
    views: count(stats.impressionCount),
    likes: count(stats.likeCount),
    comments: count(stats.commentCount),
    shares: count(stats.shareCount),
    saves: 0,
    watch_time_seconds: 0,
    completion: 0,
    clicks: count(stats.clickCount),
    followers_generated: 0,
    unique_impressions: count(stats.uniqueImpressionsCount ?? stats.uniqueImpressionsCounts),
    engagement: ratio(stats.engagement),
    url: id ? `https://www.linkedin.com/feed/update/${encodeURIComponent(id)}` : "",
    analytics_scope: "organization",
  };
}

export async function fetchLinkedInOrganizationMetrics(postUrn, env = process.env, fetchImpl = fetch, grantedScopes = "") {
  const token = clean(env.LINKEDIN_ACCESS_TOKEN);
  const version = clean(env.LINKEDIN_VERSION);
  const organizationUrn = clean(env.LINKEDIN_ORGANIZATION_URN);
  if (!token) throw missingCredential("LinkedIn access token absent");
  if (!version) throw missingCredential("LINKEDIN_VERSION absent");
  if (!organizationUrn) throw missingCredential("LINKEDIN_ORGANIZATION_URN absent");
  const granted = scopes(grantedScopes);
  if (granted.size && !granted.has("rw_organization_admin")) throw missingScope("rw_organization_admin");

  const response = await fetchImpl(linkedInOrganizationStatisticsUrl(postUrn, organizationUrn), {
    headers: {
      Authorization: `Bearer ${token}`,
      "LinkedIn-Version": version,
      "X-Restli-Protocol-Version": "2.0.0",
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.message || data?.error?.message || data?.error || response.statusText || "unknown";
    const error = new Error(`LinkedIn organization analytics ${response.status}: ${String(detail).slice(0, 500)}`);
    error.status = response.status;
    if ([401, 403].includes(response.status)) error.code = "needs_reauth";
    throw error;
  }
  return normalizeLinkedInOrganizationMetrics(postUrn, data);
}
