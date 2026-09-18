const FALLBACK_PUBLIC_ORIGIN = "https://le-hibou-ruse-site.vercel.app";

function truthy(value) {
  return ["1", "true", "yes", "oui", "on"].includes(String(value ?? "").trim().toLowerCase());
}

function httpsOrigin(value) {
  try {
    const url = new URL(String(value || "").trim());
    if (url.protocol !== "https:") return "";
    return url.origin;
  } catch {
    return "";
  }
}

export function publicSiteOrigin(env = process.env) {
  const customHost = String(env.HIBOU_CANONICAL_HOST || "d4d5d6.com").trim().toLowerCase();
  const customVerified = truthy(env.HIBOU_CANONICAL_DOMAIN_VERIFIED);
  const explicit = httpsOrigin(env.HIBOU_PUBLIC_BASE_URL);

  if (customVerified && customHost) return `https://${customHost}`;

  if (explicit) {
    try {
      const host = new URL(explicit).hostname.toLowerCase();
      if (host.endsWith(".vercel.app")) return explicit;
    } catch {}
  }

  return FALLBACK_PUBLIC_ORIGIN;
}

export { FALLBACK_PUBLIC_ORIGIN };
