function clean(value) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim();
}

export function oauthPublicResultUrl(requestUrl, params = {}) {
  const url = new URL("/connexion-sociale", requestUrl);
  for (const [key, value] of Object.entries(params)) {
    const normalized = clean(value).slice(0, 180);
    if (normalized) url.searchParams.set(key, normalized);
  }
  return url;
}
