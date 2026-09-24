import { NextResponse } from "next/server";
import { createRecord, queryRecords, TABLES } from "../../../lib/airtable";
import { normalizeAttribution } from "../../../lib/attribution.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const EVENTS = new Set(["landing", "checkout_click"]);
const MAX_BODY_BYTES = 10_000;
const ALLOWED_ORIGINS = new Set([
  "https://d4d5d6.com",
  "https://www.d4d5d6.com",
  "https://le-hibou-ruse-site.vercel.app",
]);

function clean(value, max = 120) {
  return String(value || "").replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, max);
}

function json(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

function allowedOrigin(request) {
  const origin = request.headers.get("origin") || "";
  if (!origin) return false;
  try {
    const url = new URL(origin);
    return ALLOWED_ORIGINS.has(url.origin);
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
  if (!allowedOrigin(request)) return json({ ok: false, error: "Origin refused" }, 403);
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) return json({ ok: false, error: "Format invalid" }, 415);
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) return json({ ok: false, error: "Payload too large" }, 413);

  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return json({ ok: false, error: "Payload too large" }, 413);
  let body = {};
  try { body = JSON.parse(raw); }
  catch { return json({ ok: false, error: "Invalid JSON" }, 400); }

  const event = clean(body.event, 40);
  const eventId = clean(body.event_id, 180);
  const sessionId = clean(body.session_id, 120);
  if (!EVENTS.has(event) || !eventId || !sessionId) {
    return json({ ok: false, error: "Invalid event" }, 422);
  }

  if (await exists(eventId)) {
    return json({ ok: true, deduplicated: true });
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
  return json({ ok: true });
}
