import { createHmac, timingSafeEqual } from "node:crypto";
import { DIGIFY_ADD_RECIPIENT_DEFAULT_URL } from "./digify-config.mjs";

const LEMON_WEBHOOK_KDF_CONTEXT = "hibou:lemon-squeezy:webhook:v1";

export function resolveLemonWebhookSecret(env = process.env) {
  const explicit = String(env.LEMON_SQUEEZY_WEBHOOK_SECRET || "").trim();
  if (explicit) return explicit;
  const root = String(env.CRON_SECRET || "").trim();
  if (!root) return "";
  return createHmac("sha256", root)
    .update(LEMON_WEBHOOK_KDF_CONTEXT)
    .digest("base64url")
    .slice(0, 40);
}

// Lemon needs the same signing secret when the bootstrap creates a webhook and when
// the runtime verifies it. If a dedicated secret is not configured, derive an isolated,
// deterministic value from the already-server-only CRON_SECRET so the operator does not
// have to copy a second secret. An explicit Lemon secret always wins.
if (!process.env.LEMON_SQUEEZY_WEBHOOK_SECRET) {
  const derivedLemonSecret = resolveLemonWebhookSecret(process.env);
  if (derivedLemonSecret) process.env.LEMON_SQUEEZY_WEBHOOK_SECRET = derivedLemonSecret;
}

export function verifyLemonSignature(rawBody, signature, secret) {
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody || ""), "utf8");
  const provided = String(signature || "").trim().toLowerCase();
  const key = String(secret || "");
  if (!provided || !key || !/^[a-f0-9]{64}$/.test(provided)) return false;
  const expected = createHmac("sha256", key).update(body).digest("hex");
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(provided, "hex"));
}

export function escapeFormula(value) {
  return String(value || "").replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

export function lemonOrder(payload = {}) {
  const data = payload?.data || {};
  const attributes = data?.attributes || {};
  const item = attributes?.first_order_item || {};
  return {
    event: String(payload?.meta?.event_name || ""),
    id: String(data?.id || attributes?.identifier || ""),
    identifier: String(attributes?.identifier || data?.id || ""),
    email: String(attributes?.user_email || "").trim().toLowerCase(),
    currency: String(attributes?.currency || "EUR").toUpperCase(),
    total: Number(attributes?.total || 0) / 100,
    status: String(attributes?.status || ""),
    refunded: Boolean(attributes?.refunded),
    refundedAt: attributes?.refunded_at || "",
    createdAt: attributes?.created_at || new Date().toISOString(),
    productId: String(item?.product_id ?? ""),
    variantId: String(item?.variant_id ?? ""),
    productName: String(item?.product_name || "Le Hibou Rusé"),
    testMode: Boolean(attributes?.test_mode || item?.test_mode),
    customData: payload?.meta?.custom_data && typeof payload.meta.custom_data === "object" ? payload.meta.custom_data : {},
  };
}

export function saleIsRefunded(fields = {}) {
  const status = String(fields?.Statut?.name || fields?.Statut || "").trim().toLowerCase();
  const refund = String(fields?.Remboursement || "").trim();
  return status === "refunded" || status === "remboursée" || Boolean(refund && refund.toLowerCase() !== "non");
}

export function canonicalSale(records = []) {
  return [...records].sort((left, right) => {
    const leftAt = Date.parse(String(left?.createdTime || ""));
    const rightAt = Date.parse(String(right?.createdTime || ""));
    const leftTime = Number.isFinite(leftAt) ? leftAt : Number.MAX_SAFE_INTEGER;
    const rightTime = Number.isFinite(rightAt) ? rightAt : Number.MAX_SAFE_INTEGER;
    if (leftTime !== rightTime) return leftTime - rightTime;
    return String(left?.id || "").localeCompare(String(right?.id || ""));
  })[0] || null;
}

const PLACEHOLDERS = {
  file_guid: (context) => context.fileGuid,
  email: (context) => context.email,
  order_id: (context) => context.orderId,
};

function substitute(value, context) {
  if (typeof value === "string") {
    return value.replace(/\{\{(file_guid|email|order_id)\}\}/g, (_, key) => String(PLACEHOLDERS[key](context) || ""));
  }
  if (Array.isArray(value)) return value.map((item) => substitute(item, context));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, substitute(item, context)]));
  return value;
}

function digifyAuth(env = process.env) {
  const keyId = String(env.DIGIFY_KEY_ID || "").trim();
  const secret = String(env.DIGIFY_SECRET || "").trim();
  if (!keyId || !secret) throw new Error("Digify credentials absents");
  return {
    Authorization: `Basic ${Buffer.from(`${keyId}:${secret}`, "utf8").toString("base64")}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function parseDigifyTemplate(templateText, label, context) {
  if (!templateText) throw new Error(`${label} absent: renseigner le schéma officiel du Developer Portal Digify`);
  let template;
  try { template = JSON.parse(templateText); }
  catch { throw new Error(`${label} doit être un JSON valide`); }
  const body = substitute(template, context);
  const serialized = JSON.stringify(body);
  if (!serialized.includes(context.email) || !serialized.includes(context.fileGuid)) {
    throw new Error(`Template Digify invalide: {{email}} et {{file_guid}} sont requis`);
  }
  return body;
}

function safeDigifyUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "api.digify.com") {
    throw new Error("Endpoint Digify refusé: HTTPS api.digify.com uniquement");
  }
  return url.toString();
}

function safeDigifyAccessUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const url = new URL(raw);
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || (host !== "digify.com" && !host.endsWith(".digify.com"))) {
    throw new Error("Lien d'accès Digify refusé: domaine Digify HTTPS requis");
  }
  return url.toString();
}

export function digifyRecipientRequest(context, env = process.env) {
  const url = safeDigifyUrl(env.DIGIFY_ADD_RECIPIENT_URL || DIGIFY_ADD_RECIPIENT_DEFAULT_URL);
  return {
    url,
    headers: digifyAuth(env),
    body: parseDigifyTemplate(String(env.DIGIFY_ADD_RECIPIENT_BODY_TEMPLATE || "").trim(), "DIGIFY_ADD_RECIPIENT_BODY_TEMPLATE", context),
  };
}

export function digifyRevokeRequest(context, env = process.env) {
  const url = safeDigifyUrl(env.DIGIFY_REVOKE_RECIPIENT_URL);
  if (!url) throw new Error("DIGIFY_REVOKE_RECIPIENT_URL absent: renseigner l'endpoint officiel Digify de révocation du Developer Portal");
  return {
    url,
    headers: digifyAuth(env),
    body: parseDigifyTemplate(String(env.DIGIFY_REVOKE_RECIPIENT_BODY_TEMPLATE || "").trim(), "DIGIFY_REVOKE_RECIPIENT_BODY_TEMPLATE", context),
  };
}

async function digifyPost(request, label) {
  let response;
  try {
    response = await fetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: JSON.stringify(request.body),
      cache: "no-store",
    });
  } catch (cause) {
    const error = new Error(`${label}: réponse réseau inconnue; vérifier Digify avant de rejouer`);
    error.retryable = false;
    error.ambiguous = true;
    error.cause = cause;
    throw error;
  }

  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { text: text.slice(0, 1000) }; }
  if (!response.ok) {
    const detail = data?.message || data?.Message || data?.error || data?.Error || data?.text || response.statusText;
    const error = new Error(`${label} ${response.status}: ${String(detail || "unknown").slice(0, 600)}`);
    error.retryable = response.status === 429;
    error.ambiguous = response.status === 408 || response.status >= 500;
    throw error;
  }
  return data;
}

export async function addDigifyRecipient(context, env = process.env) {
  const data = await digifyPost(digifyRecipientRequest(context, env), "Digify add recipient");
  const rawAccessUrl = String(data?.Link || data?.link || data?.Url || data?.URL || data?.url || data?.FileLink || data?.file_link || "");
  const accessUrl = safeDigifyAccessUrl(rawAccessUrl);
  return { data, accessUrl };
}

export async function revokeDigifyRecipient(context, env = process.env) {
  const data = await digifyPost(digifyRevokeRequest(context, env), "Digify revoke recipient");
  return { data };
}
