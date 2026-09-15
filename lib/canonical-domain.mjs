const DEFAULT_CANONICAL_HOST = "le-hibou-ruse-site.vercel.app";
const LEGACY_ALIAS_HOSTS = new Set(["d4d5d6.com", "www.d4d5d6.com"]);

function cleanHost(value) {
  return String(value || "").trim().toLowerCase().replace(/:\d+$/, "");
}

export function canonicalRedirectEnabled(env = process.env) {
  return ["1", "true", "yes", "on"].includes(String(env.HIBOU_CANONICAL_REDIRECT_ENABLED || "").trim().toLowerCase());
}

export function canonicalHost(env = process.env) {
  return cleanHost(env.HIBOU_CANONICAL_HOST || DEFAULT_CANONICAL_HOST) || DEFAULT_CANONICAL_HOST;
}

export function shouldCanonicalRedirect({ host, method = "GET", accept = "", env = process.env } = {}) {
  if (!canonicalRedirectEnabled(env)) return false;
  if (!["GET", "HEAD"].includes(String(method || "").toUpperCase())) return false;
  if (!String(accept || "").toLowerCase().includes("text/html")) return false;

  const current = cleanHost(host);
  const canonical = canonicalHost(env);
  if (!current || current === canonical) return false;

  // Only known public aliases and alternate Vercel aliases may redirect.
  // API/webhook traffic is protected above by the method/Accept guards.
  return LEGACY_ALIAS_HOSTS.has(current)
    || (current.endsWith(".vercel.app") && current !== canonical);
}

export function canonicalRedirectUrl(inputUrl, env = process.env) {
  const url = new URL(String(inputUrl));
  url.protocol = "https:";
  url.hostname = canonicalHost(env);
  url.port = "";
  return url;
}
