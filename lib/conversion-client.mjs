import { captureAttribution, normalizeAttribution } from "./attribution.mjs";

let inMemorySessionId = "";
let inMemoryAttribution = {};

function randomId() {
  try { return globalThis.crypto?.randomUUID?.() || ""; } catch { return ""; }
}

export function sessionId() {
  if (inMemorySessionId) return inMemorySessionId;
  inMemorySessionId = randomId() || `s-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  return inMemorySessionId;
}

export function currentAttribution({ search, href, referrer } = {}) {
  const attribution = captureAttribution({
    search: search ?? globalThis.location?.search ?? "",
    href: href ?? globalThis.location?.href ?? "",
    referrer: referrer ?? globalThis.document?.referrer ?? "",
    previous: inMemoryAttribution,
  });
  inMemoryAttribution = normalizeAttribution({ ...attribution, session_id: sessionId() });
  return inMemoryAttribution;
}

export function sendConversionEvent(event, attribution = {}, { dedupeKey = "" } = {}) {
  try {
    const session = sessionId();
    const eventId = dedupeKey ? `${session}:${dedupeKey}` : `${session}:${event}:${randomId() || Date.now()}`;
    const payload = JSON.stringify({ event, event_id: eventId, session_id: session, attribution });
    fetch("/api/conversion-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => {});
  } catch {}
}
