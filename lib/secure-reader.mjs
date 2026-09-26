import { createHmac, timingSafeEqual } from "node:crypto";

const READER_KDF_CONTEXT = "hibou:secure-reader:v1";

function text(value) {
  return String(value ?? "").trim();
}

export function resolveReaderSecret(env = process.env) {
  const explicit = text(env.HIBOU_READER_SECRET);
  if (explicit) return explicit;
  const root = text(env.CRON_SECRET);
  if (!root) return "";
  return createHmac("sha256", root)
    .update(READER_KDF_CONTEXT)
    .digest("base64url");
}

function signature(payload, secret) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createReaderToken({ saleId, orderIdentifier, edition = "" } = {}, env = process.env) {
  const secret = resolveReaderSecret(env);
  if (!secret) throw new Error("Secret lecteur absent");
  const sale = text(saleId);
  const order = text(orderIdentifier);
  if (!sale || !order) throw new Error("Identité lecteur incomplète");
  const payload = Buffer.from(JSON.stringify({
    v: 1,
    sale_id: sale,
    order_identifier: order,
    edition: text(edition),
  }), "utf8").toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}

export function verifyReaderToken(token, env = process.env) {
  const raw = text(token);
  const secret = resolveReaderSecret(env);
  if (!raw || !secret) return null;
  const parts = raw.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [payload, provided] = parts;
  const expected = signature(payload, secret);
  const left = Buffer.from(provided, "utf8");
  const right = Buffer.from(expected, "utf8");
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (decoded?.v !== 1) return null;
    const saleId = text(decoded.sale_id);
    const orderIdentifier = text(decoded.order_identifier);
    if (!saleId || !orderIdentifier) return null;
    return {
      saleId,
      orderIdentifier,
      edition: text(decoded.edition),
    };
  } catch {
    return null;
  }
}
