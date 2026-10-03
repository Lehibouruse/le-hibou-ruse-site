function originOf(value) {
  try {
    return new URL(String(value || "")).origin;
  } catch {
    return "";
  }
}

export function sameOriginFormRequest(request) {
  const expectedOrigin = new URL(request.url).origin;
  const fetchSite = String(request.headers.get("sec-fetch-site") || "").toLowerCase();
  if (["same-origin", "same-site", "none"].includes(fetchSite)) return true;

  const refererOrigin = originOf(request.headers.get("referer"));
  if (refererOrigin === expectedOrigin) return true;

  const origin = String(request.headers.get("origin") || "").trim();
  if (!origin) return !fetchSite;
  return originOf(origin) === expectedOrigin;
}
