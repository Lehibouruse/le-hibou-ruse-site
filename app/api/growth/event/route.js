import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createRecord, TABLES } from "../../../../lib/airtable";
import { normalizeAttribution } from "../../../../lib/attribution.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const ALLOWED_EVENTS = new Set(["landing", "checkout_click"]);

function clean(value, max = 120) {
  return String(value ?? "").replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, max);
}

function validSession(value) {
  return /^[A-Za-z0-9_-]{8,96}$/.test(String(value || ""));
}

function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function POST(request) {
  if (!sameOrigin(request)) return NextResponse.json({ ok: false, error: "Origin refused" }, { status: 403 });
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 12000) return NextResponse.json({ ok: false, error: "Payload too large" }, { status: 413 });

  let body = {};
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }

  const event = clean(body.event, 40);
  const sessionId = clean(body.session_id, 96);
  if (!ALLOWED_EVENTS.has(event) || !validSession(sessionId)) {
    return NextResponse.json({ ok: false, error: "Invalid event" }, { status: 422 });
  }

  const attribution = normalizeAttribution(body.attribution || {});
  const eventId = `evt_${randomUUID()}`;
  try {
    await createRecord(TABLES.conversionEvents, {
      "Event ID": eventId,
      "Session ID": sessionId,
      Event: event,
      "Occurred At": new Date().toISOString(),
      "UTM Source": attribution.utm_source || "",
      "UTM Medium": attribution.utm_medium || "",
      Campaign: attribution.utm_campaign || "",
      "UTM Content": attribution.utm_content || "",
      "Landing Page": attribution.landing_page || "",
      Referrer: attribution.referrer || "",
    });
    return NextResponse.json({ ok: true, event_id: eventId });
  } catch (error) {
    return NextResponse.json({ ok: false, error: "Event unavailable" }, { status: 503 });
  }
}
