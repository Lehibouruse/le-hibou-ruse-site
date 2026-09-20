function clean(value) {
  return String(value ?? "").trim();
}

export function requireTikTokUserToken(response) {
  const token = response && typeof response === "object" ? response : {};
  const missing = ["access_token", "refresh_token", "open_id", "expires_in"].filter((key) => !clean(token[key]));
  if (!missing.length) return token;

  const detail = clean(token.error_description || token.error?.message || token.message || token.error);
  const logId = clean(token.log_id);
  const suffix = [detail, logId ? `log_id=${logId}` : ""].filter(Boolean).join("; ");
  throw new Error(`TikTok OAuth: réponse sans jeton utilisateur complet (${missing.join(", ")})${suffix ? `: ${suffix.slice(0, 300)}` : ""}`);
}
