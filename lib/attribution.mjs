export const ATTRIBUTION_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "landing_page",
  "referrer",
];

const LIMITS = {
  utm_source: 80,
  utm_medium: 80,
  utm_campaign: 120,
  utm_content: 160,
  utm_term: 120,
  landing_page: 300,
  referrer: 300,
};

export function cleanAttributionValue(value, key = "utm_content") {
  const limit = LIMITS[key] || 160;
  return String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim()
    .slice(0, limit);
}

export function normalizeAttribution(input = {}) {
  return Object.fromEntries(
    ATTRIBUTION_KEYS
      .map((key) => [key, cleanAttributionValue(input[key], key)])
      .filter(([, value]) => Boolean(value)),
  );
}

export function captureAttribution({ search = "", href = "", referrer = "", previous = {} } = {}) {
  const params = new URLSearchParams(String(search || "").replace(/^\?/, ""));
  const incoming = {};
  for (const key of ATTRIBUTION_KEYS.filter((key) => key.startsWith("utm_"))) {
    const value = params.get(key);
    if (value) incoming[key] = value;
  }

  const base = normalizeAttribution(previous);
  const hasIncomingCampaign = Object.keys(incoming).length > 0;
  const next = hasIncomingCampaign ? { ...base, ...normalizeAttribution(incoming) } : { ...base };

  if (!next.landing_page && href) {
    try {
      const url = new URL(href, "https://d4d5d6.com");
      next.landing_page = cleanAttributionValue(`${url.pathname}${url.search}`, "landing_page");
    } catch {}
  }
  if (!next.referrer && referrer) {
    try {
      const url = new URL(referrer);
      next.referrer = cleanAttributionValue(`${url.origin}${url.pathname}`, "referrer");
    } catch {
      next.referrer = cleanAttributionValue(referrer, "referrer");
    }
  }
  return normalizeAttribution(next);
}

export function checkoutWithAttribution(href, attribution = {}, clickEvent = "checkout_opened") {
  const raw = String(href || "").trim();
  if (!raw) return raw;
  let url;
  try { url = new URL(raw); } catch { return raw; }
  if (!/(^|\.)lemonsqueezy\.com$/i.test(url.hostname)) return raw;

  // Lemon can return a checkout URL protected by a server-side signature.
  // Mutating any query parameter after that signature was generated makes the
  // checkout invalid. First-party attribution is still recorded separately by
  // TrackedLink/sendConversionEvent; signed checkout URLs must remain byte-for-byte intact.
  if (url.searchParams.has("signature") || url.searchParams.has("expires")) return raw;

  const data = normalizeAttribution(attribution);
  for (const [key, value] of Object.entries(data)) {
    url.searchParams.set(`checkout[custom][${key}]`, value);
  }
  if (clickEvent) {
    url.searchParams.set("checkout[custom][click_event]", cleanAttributionValue(clickEvent, "utm_content"));
  }
  return url.toString();
}

export function socialCampaignUrl({
  baseUrl = "https://d4d5d6.com/",
  provider,
  campaign,
  contentId,
  medium = "organic_social",
} = {}) {
  const url = new URL(baseUrl);
  const values = normalizeAttribution({
    utm_source: provider,
    utm_medium: medium,
    utm_campaign: campaign,
    utm_content: contentId,
  });
  for (const [key, value] of Object.entries(values)) {
    if (key.startsWith("utm_")) url.searchParams.set(key, value);
  }
  return url.toString();
}

export function saleAttribution(customData = {}) {
  const data = customData && typeof customData === "object" ? customData : {};
  return normalizeAttribution({
    utm_source: data.utm_source || data.source,
    utm_medium: data.utm_medium || data.medium,
    utm_campaign: data.utm_campaign || data.campaign,
    utm_content: data.utm_content || data.content,
    utm_term: data.utm_term || data.term,
    landing_page: data.landing_page,
    referrer: data.referrer,
  });
}
