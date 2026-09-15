function clean(value) {
  return String(value ?? "").trim();
}

function envName(provider, suffix) {
  return `HIBOU_SOCIAL_${clean(provider).toUpperCase()}_${suffix}`;
}

export function safeDirectFallbackError(error) {
  const message = clean(error?.message || error);
  if (!message) return false;
  if (/\b(401|403)\b/.test(message)) return true;
  return /(credential|credentials|access token|refresh token|oauth).*(absent|missing|expired|invalid|refus|unauthor)/i.test(message)
    || /(absent|missing|expired|invalid).*(credential|access token|refresh token|oauth)/i.test(message);
}

export function socialWebhookFallbackConfigured(provider, env = process.env) {
  const value = clean(env[envName(provider, "WEBHOOK_URL")]);
  if (!value) return false;
  try { return new URL(value).protocol === "https:"; }
  catch { return false; }
}

export async function dispatchSocialWebhookFallback(provider, payload, env = process.env, fetchImpl = fetch) {
  const network = clean(provider).toLowerCase();
  const url = clean(env[envName(network, "WEBHOOK_URL")]);
  if (!url) throw new Error(`Webhook fallback ${network} non configuré`);
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error(`Webhook fallback ${network} doit utiliser HTTPS`);
  const headers = { "Content-Type": "application/json" };
  const secret = clean(env.HIBOU_SOCIAL_WEBHOOK_SECRET);
  if (secret) headers.Authorization = `Bearer ${secret}`;
  const response = await fetchImpl(parsed, {
    method: "POST",
    headers,
    body: JSON.stringify({ provider: network, source: "HIBOU_AGENT_V1", fallback_from: "direct", ...payload }),
    cache: "no-store",
  });
  const text = await response.text();
  let data = {};
  if (text) {
    try { data = JSON.parse(text); }
    catch { data = { text: text.slice(0, 1000) }; }
  }
  if (!response.ok) {
    const detail = data?.error?.message || data?.error || data?.message || response.statusText || "unknown";
    throw new Error(`Webhook fallback ${network} ${response.status}: ${String(detail).slice(0, 500)}`);
  }
  return { ok: true, dry_run: false, provider: network, mode: "webhook_fallback", result: data };
}
