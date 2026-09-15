import { createHmac, timingSafeEqual } from "node:crypto";

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

export function digifyRecipientRequest(context, env = process.env) {
  const keyId = String(env.DIGIFY_KEY_ID || "").trim();
  const secret = String(env.DIGIFY_SECRET || "").trim();
  const templateText = String(env.DIGIFY_ADD_RECIPIENT_BODY_TEMPLATE || "").trim();
  if (!keyId || !secret) throw new Error("Digify credentials absents");
  if (!templateText) throw new Error("DIGIFY_ADD_RECIPIENT_BODY_TEMPLATE absent: renseigner le schéma officiel du Developer Portal Digify");
  let template;
  try { template = JSON.parse(templateText); }
  catch { throw new Error("DIGIFY_ADD_RECIPIENT_BODY_TEMPLATE doit être un JSON valide"); }
  const body = substitute(template, context);
  const serialized = JSON.stringify(body);
  if (!serialized.includes(context.email) || !serialized.includes(context.fileGuid)) {
    throw new Error("Template Digify invalide: {{email}} et {{file_guid}} sont requis");
  }
  return {
    url: "https://api.digify.com/v1/file/recipient/add",
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${secret}`, "utf8").toString("base64")}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body,
  };
}

export async function addDigifyRecipient(context, env = process.env) {
  const request = digifyRecipientRequest(context, env);
  const response = await fetch(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify(request.body),
    cache: "no-store",
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { text: text.slice(0, 1000) }; }
  if (!response.ok) {
    const detail = data?.message || data?.Message || data?.error || data?.Error || data?.text || response.statusText;
    const error = new Error(`Digify add recipient ${response.status}: ${String(detail || "unknown").slice(0, 600)}`);
    error.retryable = response.status === 408 || response.status === 429 || response.status >= 500;
    throw error;
  }
  const accessUrl = String(data?.Link || data?.link || data?.Url || data?.URL || data?.url || data?.FileLink || data?.file_link || "");
  return { data, accessUrl };
}
