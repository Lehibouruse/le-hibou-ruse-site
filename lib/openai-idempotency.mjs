import { createHash } from "node:crypto";

function canonical(value) {
  if (value === null || value === undefined) return value ?? null;
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  if (typeof value === "number" && !Number.isFinite(value)) return String(value);
  return value;
}

function safeScope(value) {
  const scope = String(value || "request")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return scope || "request";
}

export function openAiIdempotencyKey(scope, payload) {
  const digest = createHash("sha256")
    .update(JSON.stringify(canonical(payload)), "utf8")
    .digest("hex");
  return `hibou-${safeScope(scope)}-${digest}`.slice(0, 255);
}

export function openAiRequestHeaders(apiKey, scope, payload, extra = {}) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "Idempotency-Key": openAiIdempotencyKey(scope, payload),
    ...extra,
  };
}
