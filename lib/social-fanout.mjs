export const SOCIAL_FANOUT_PROVIDERS = Object.freeze([
  "youtube",
  "instagram",
  "facebook",
  "threads",
  "tiktok",
  "linkedin",
  "pinterest",
  "x",
  "snapchat",
]);

function clean(value) {
  return String(value ?? "").trim();
}

function uniqueProviders(values = []) {
  const allowed = new Set(SOCIAL_FANOUT_PROVIDERS);
  const seen = new Set();
  const result = [];
  for (const value of values) {
    const provider = clean(value).toLowerCase();
    if (!allowed.has(provider) || seen.has(provider)) continue;
    seen.add(provider);
    result.push(provider);
  }
  return result;
}

export function requestedFanoutProviders(params = {}) {
  if (Array.isArray(params.providers)) {
    const explicit = uniqueProviders(params.providers);
    if (explicit.length) return explicit;
  }
  const provider = clean(params.provider || params.network).toLowerCase();
  return provider === "all" || provider === "*" ? [...SOCIAL_FANOUT_PROVIDERS] : [];
}

export function safeSocialKey(value, fallback = "hibou-social") {
  const normalized = clean(value).replace(/[^A-Za-z0-9._:-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 180);
  return normalized || fallback;
}

export function fanoutChildSpec({ parentJobId, parentIdempotencyKey, provider, params = {}, requestedBy = "Jobs", priority = "Normal", requiresReview = false, maxRetries = 2, now = new Date() }) {
  const network = clean(provider).toLowerCase();
  if (!SOCIAL_FANOUT_PROVIDERS.includes(network)) throw new Error(`Provider fan-out non pris en charge: ${network || "vide"}`);
  const parent = safeSocialKey(parentJobId || "social-fanout");
  const childJobId = safeSocialKey(`${parent}:${network}`);
  const idempotencyBase = safeSocialKey(parentIdempotencyKey || `job:${parent}`);
  const childIdempotencyKey = safeSocialKey(`${idempotencyBase}:${network}`);
  const childParams = { ...params, provider: network };
  delete childParams.providers;
  if (clean(childParams.network).toLowerCase() === "all" || clean(childParams.network) === "*") delete childParams.network;
  childParams.idempotency_key = childIdempotencyKey;
  childParams.fanout_parent_job_id = parent;

  return {
    job_id: childJobId,
    created_at: now.toISOString(),
    requested_by: clean(requestedBy) || "Jobs",
    action: "SCHEDULE_POST",
    target: network,
    parameters: JSON.stringify(childParams),
    priority: typeof priority === "string" ? priority : clean(priority?.name) || "Normal",
    status: "Pending",
    requires_review: Boolean(requiresReview),
    idempotency_key: childIdempotencyKey,
    retry_count: 0,
    max_retries: Math.max(0, Math.min(2, Number(maxRetries ?? 2))),
    agent_status: "queued",
  };
}
