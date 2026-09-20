import { createHmac, timingSafeEqual } from "node:crypto";

function clean(value) { return String(value ?? "").trim(); }

function base64urlDecode(value) {
  const normalized = clean(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

export function verifyMetaSignedRequest(signedRequest, secret) {
  const raw = clean(signedRequest);
  const appSecret = clean(secret);
  if (!raw || !appSecret) throw new Error("signed_request ou secret absent");
  const parts = raw.split(".");
  if (parts.length !== 2) throw new Error("signed_request invalide");

  const [signaturePart, payloadPart] = parts;
  const signature = base64urlDecode(signaturePart);
  const expected = createHmac("sha256", appSecret).update(payloadPart, "utf8").digest();
  if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) {
    throw new Error("signature Meta invalide");
  }

  const payload = JSON.parse(base64urlDecode(payloadPart).toString("utf8"));
  if (String(payload.algorithm || "").toUpperCase() !== "HMAC-SHA256") {
    throw new Error("algorithme Meta invalide");
  }
  return payload;
}
