export const ATTRIBUTION_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
  "landing_page",
  "referrer",
  "session_id",
];

const LIMITS = {
  utm_source: 80,
  utm_medium: 80,
  utm_campaign: 120,
  utm_content: 160,
  utm_term: 120,
  landing_page: 300,
  referrer: 300,
  session_id: 120,
};

export function cleanAttributionValue(value, key = "utm_content") {
  const limit = LIMITS[key] || 160;
  const cleaned = String(value || "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .trim();
  if (!cleaned) return "";
  if (key === "landing_page" || key === "referrer") {
    try {
      const url = key === "landing_page" ? new URL(cleaned, "https://d4d5d6.com") : new URL(cleaned);
      if (!['http:', 'https:'].includes(url.protocol)) return "";
      return (key === "landing_page" ? url.pathname : url.origin).slice(0, limit);
    } catch { return ""; }
  }
  return cleaned.slice(0, limit);
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
      next.landing_page = cleanAttributionValue(url.pathname, "landing_page");
    } catch {}
  }
  if (!next.referrer && referrer) {
    try {
      const url = new URL(referrer);
      next.referrer = cleanAttributionValue(url.origin, "referrer");
    } catch {}
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
    session_id: data.session_id,
  });
}

export function attributionProvenance(attribution = {}) {
  const normalized = normalizeAttribution(attribution);
  if (normalized.utm_source) return normalized.utm_source;
  if (!normalized.referrer) return "Accès direct ou source inconnue";
  try {
    const host = new URL(normalized.referrer).hostname.toLowerCase().replace(/^www\./, "");
    if (host === "d4d5d6.com") return "Accès direct ou source inconnue";
    if (/(^|\.)google\./.test(host)) return "Google organique";
    if (host === "bing.com" || host.endsWith(".bing.com")) return "Bing organique";
    return `Référence : ${host}`.slice(0, 160);
  } catch {
    return "Accès direct ou source inconnue";
  }
}
