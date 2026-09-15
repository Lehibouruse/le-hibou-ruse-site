import { NextResponse } from "next/server";
import { createRecord, queryRecords, TABLES } from "../../../lib/airtable";
import { normalizeAttribution } from "../../../lib/attribution.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const EVENTS = new Set(["landing", "checkout_click"]);

function clean(value, max = 120) {
  return String(value || "").replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, max);
}

function allowedOrigin(request) {
  const origin = request.headers.get("origin") || "";
  if (!origin) return false;
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host === "d4d5d6.com" || host === "www.d4d5d6.com" || host === "le-hibou-ruse-site.vercel.app" || host.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

async function exists(eventId) {
  const safe = clean(eventId, 180).replaceAll("\\", "\\\\").replaceAll("'", "\\'");
  if (!safe) return false;
  const records = await queryRecords(TABLES.conversionEvents, {
    filterByFormula: `{Event ID}='${safe}'`,
    pageSize: 1,
  });
  return records.length > 0;
}

export async function POST(request) {
  if (!allowedOrigin(request)) return NextResponse.json({ ok: false, error: "Origin refused" }, { status: 403 });
  let body = {};
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }

  const event = clean(body.event, 40);
  const eventId = clean(body.event_id, 180);
  const sessionId = clean(body.session_id, 120);
  if (!EVENTS.has(event) || !eventId || !sessionId) {
    return NextResponse.json({ ok: false, error: "Invalid event" }, { status: 422 });
  }

  if (event === "landing" && await exists(eventId)) {
    return NextResponse.json({ ok: true, deduplicated: true });
  }

  const attribution = normalizeAttribution(body.attribution || {});
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
  return NextResponse.json({ ok: true });
}
