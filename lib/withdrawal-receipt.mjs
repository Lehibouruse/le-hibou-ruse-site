function text(value) {
  return String(value ?? "").trim();
}

function safeHttpsUrl(value) {
  try {
    const url = new URL(text(value));
    if (url.protocol !== "https:") return "";
    if (!url.hostname || url.username || url.password) return "";
    if (["localhost", "127.0.0.1", "::1"].includes(url.hostname.toLowerCase())) return "";
    return url.toString();
  } catch {
    return "";
  }
}

export function withdrawalReceiptWebhookConfig(env = process.env) {
  const url = safeHttpsUrl(env.WITHDRAWAL_RECEIPT_WEBHOOK_URL);
  const secret = text(env.WITHDRAWAL_RECEIPT_WEBHOOK_SECRET);
  if (!url || !secret) return { configured: false, url: "", secret: "" };
  return { configured: true, url, secret };
}

export async function sendWithdrawalReceipt(payload, options = {}) {
  const env = options.env || process.env;
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = Math.max(1000, Math.min(15_000, Number(options.timeoutMs || 8000)));
  const config = withdrawalReceiptWebhookConfig(env);
  if (!config.configured) {
    return { ok: false, configured: false, code: "not_configured" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(config.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.secret}`,
        "Content-Type": "application/json",
        "X-Hibou-Event": "withdrawal.receipt",
      },
      body: JSON.stringify({
        event: "withdrawal.receipt",
        version: 1,
        request_id: text(payload.request_id),
        submitted_at: text(payload.submitted_at),
        first_name: text(payload.first_name),
        last_name: text(payload.last_name),
        email: text(payload.email),
        contract_reference: text(payload.contract_reference),
        subject: "Accusé de réception de votre déclaration de rétractation — Le Hibou Rusé",
        receipt_text: text(payload.receipt_text),
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      return { ok: false, configured: true, code: `http_${response.status}` };
    }
    return { ok: true, configured: true, code: "sent" };
  } catch (error) {
    return {
      ok: false,
      configured: true,
      code: error?.name === "AbortError" ? "timeout" : "transport_error",
    };
  } finally {
    clearTimeout(timer);
  }
}
