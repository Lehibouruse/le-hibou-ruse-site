import { createHash } from "node:crypto";

const SUPPORTED_TYPES = new Set(["View", "Print", "Download"]);

function text(value) {
  return String(value ?? "").trim();
}

export function safeDigifyAccessUrl(value) {
  const raw = text(value);
  if (!raw) return "";
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || (host !== "digify.com" && !host.endsWith(".digify.com"))) return "";
    return url.toString();
  } catch {
    return "";
  }
}

export function normalizeDigifyWebhookPayload(payload = {}) {
  const rawLink = text(payload?.Link);
  const link = safeDigifyAccessUrl(rawLink);
  const eventTimeMs = Date.parse(text(payload?.EventTime));
  const event = {
    type: text(payload?.Type),
    eventTime: Number.isFinite(eventTimeMs) ? new Date(eventTimeMs).toISOString() : "",
    fileGuid: text(payload?.FileGUID),
    fileName: text(payload?.FileName),
    email: text(payload?.RecipientUserEmail).toLowerCase(),
    link,
    rawLink,
    accessType: text(payload?.AccessType),
  };

  const errors = [];
  if (!SUPPORTED_TYPES.has(event.type)) errors.push("unsupported_type");
  if (!event.fileGuid) errors.push("missing_file_guid");
  if (!event.eventTime) errors.push("invalid_event_time");
  if (event.rawLink && !event.link) errors.push("invalid_link");

  return { event, errors };
}

export function digifyWebhookFingerprint(event = {}) {
  const canonical = [
    text(event.type),
    text(event.eventTime),
    text(event.fileGuid),
    text(event.email).toLowerCase(),
    text(event.link),
    text(event.accessType),
    text(event.fileName),
  ];
  return createHash("sha256").update(JSON.stringify(canonical)).digest("hex").slice(0, 24);
}

export function digifyWebhookAction(event = {}) {
  return `${text(event.type) || "Event"} · ${text(event.fileGuid) || "no-file"} · ${digifyWebhookFingerprint(event)}`;
}
