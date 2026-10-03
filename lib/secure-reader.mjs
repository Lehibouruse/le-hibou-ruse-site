import { createHmac, timingSafeEqual } from "node:crypto";

const READER_KDF_CONTEXT = "hibou:secure-reader:v1";
const QA_PREVIEW_KDF_CONTEXT = "hibou:secure-reader:qa-preview:v1";
const QA_PREVIEW_PURPOSE = "reader_qa_preview";
const QA_PREVIEW_MAX_TTL_SECONDS = 12 * 60 * 60;

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

function qaPreviewSecret(env = process.env) {
  const readerSecret = resolveReaderSecret(env);
  if (!readerSecret) return "";
  return createHmac("sha256", readerSecret)
    .update(QA_PREVIEW_KDF_CONTEXT)
    .digest("base64url");
}

export function signReaderToken({ saleId, orderIdentifier, edition = "" } = {}, env = process.env) {
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

export function signReaderPreviewToken({ expiresInSeconds = 6 * 60 * 60, nowSeconds = Math.floor(Date.now() / 1000) } = {}, env = process.env) {
  const secret = qaPreviewSecret(env);
  if (!secret) throw new Error("Secret lecteur absent");
  const issuedAt = Math.floor(Number(nowSeconds));
  const requestedTtl = Math.floor(Number(expiresInSeconds));
  const ttl = Math.max(60, Math.min(QA_PREVIEW_MAX_TTL_SECONDS, Number.isFinite(requestedTtl) ? requestedTtl : 6 * 60 * 60));
  const payload = Buffer.from(JSON.stringify({
    v: 1,
    purpose: QA_PREVIEW_PURPOSE,
    iat: issuedAt,
    exp: issuedAt + ttl,
  }), "utf8").toString("base64url");
  return `${payload}.${signature(payload, secret)}`;
}

export function verifyReaderPreviewToken(token, env = process.env, nowSeconds = Math.floor(Date.now() / 1000)) {
  const raw = text(token);
  const secret = qaPreviewSecret(env);
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
    const now = Math.floor(Number(nowSeconds));
    if (decoded?.v !== 1 || decoded?.purpose !== QA_PREVIEW_PURPOSE) return null;
    if (!Number.isInteger(decoded.iat) || !Number.isInteger(decoded.exp)) return null;
    if (decoded.iat > now + 60 || decoded.exp <= now) return null;
    if (decoded.exp - decoded.iat < 60 || decoded.exp - decoded.iat > QA_PREVIEW_MAX_TTL_SECONDS) return null;
    return { purpose: QA_PREVIEW_PURPOSE, issuedAt: decoded.iat, expiresAt: decoded.exp };
  } catch {
    return null;
  }
}
