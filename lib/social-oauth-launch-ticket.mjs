import { createHash, timingSafeEqual } from "node:crypto";

function clean(value) {
  return String(value ?? "").trim();
}

export function hashOauthLaunchTicket(ticket) {
  return createHash("sha256").update(clean(ticket), "utf8").digest("hex");
}

function safeEqualHex(a, b) {
  const left = Buffer.from(clean(a), "hex");
  const right = Buffer.from(clean(b), "hex");
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right);
}

export function parseOauthLaunchTicketConfig(raw) {
  let parsed = {};
  try { parsed = JSON.parse(clean(raw)); } catch {}
  return {
    hash: clean(parsed.hash),
    expires_at: clean(parsed.expires_at),
    used: parsed.used === true,
  };
}

export function validateOauthLaunchTicket(ticket, rawConfig, now = new Date()) {
  const cfg = parseOauthLaunchTicketConfig(rawConfig);
  if (!clean(ticket) || !cfg.hash) return { ok: false, reason: "missing" };
  if (cfg.used) return { ok: false, reason: "used" };
  const expiry = Date.parse(cfg.expires_at);
  if (!Number.isFinite(expiry) || expiry <= now.getTime()) return { ok: false, reason: "expired" };
  const digest = hashOauthLaunchTicket(ticket);
  if (!safeEqualHex(digest, cfg.hash)) return { ok: false, reason: "invalid" };
  return { ok: true, reason: "ok", expires_at: new Date(expiry).toISOString() };
}

export function consumeOauthLaunchTicketConfig(rawConfig, usedAt = new Date()) {
  const cfg = parseOauthLaunchTicketConfig(rawConfig);
  return JSON.stringify({
    hash: cfg.hash,
    expires_at: cfg.expires_at,
    used: true,
    used_at: usedAt.toISOString(),
  });
}
