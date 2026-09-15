"use client";

import { ATTRIBUTION_STORAGE_KEY, normalizeAttribution } from "./attribution.mjs";

const SESSION_KEY = "hibou_growth_session_v1";

export function growthSessionId() {
  try {
    const existing = localStorage.getItem(SESSION_KEY);
    if (existing && /^[A-Za-z0-9_-]{8,96}$/.test(existing)) return existing;
    const generated = typeof crypto?.randomUUID === "function"
      ? crypto.randomUUID().replaceAll("-", "_")
      : `s_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
    localStorage.setItem(SESSION_KEY, generated);
    return generated;
  } catch {
    return `s_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
  }
}

export function storedAttribution() {
  try {
    return normalizeAttribution(JSON.parse(localStorage.getItem(ATTRIBUTION_STORAGE_KEY) || "{}"));
  } catch {
    return {};
  }
}

export function sendGrowthEvent(event, attribution = storedAttribution()) {
  try {
    const payload = JSON.stringify({ event, session_id: growthSessionId(), attribution: normalizeAttribution(attribution) });
    fetch("/api/growth/event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => {});
  } catch {}
}
