export const HIBOU_SESSION_KEY = "hibou_session_v1";

function randomId() {
  try { return globalThis.crypto?.randomUUID?.() || ""; } catch { return ""; }
}

export function sessionId() {
  try {
    const existing = localStorage.getItem(HIBOU_SESSION_KEY);
    if (existing) return existing;
    const next = randomId() || `s-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    localStorage.setItem(HIBOU_SESSION_KEY, next);
    return next;
  } catch {
    return `s-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  }
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
