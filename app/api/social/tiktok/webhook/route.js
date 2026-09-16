import { NextResponse } from "next/server";
import { queryRecords, TABLES, updateRecord } from "../../../../../lib/airtable.js";
import { loadSocialCredential, storeSocialCredential } from "../../../../../lib/social-credential-vault.mjs";
import { journalFieldsForTikTokWebhook, parseTikTokWebhook, tikTokWebhookAlreadyApplied, verifyTikTokWebhookSignature } from "../../../../../lib/tiktok-webhook.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function clean(value) { return String(value ?? "").trim(); }
function escFormula(value) { return clean(value).replaceAll("\\", "\\\\").replaceAll("'", "\\'"); }

async function socialJournalForPublishId(publishId) {
  const needle = `"publish_id":"${clean(publishId).replaceAll('"', '\\"')}"`;
  return queryRecords(TABLES.journal, {
    filterByFormula: `AND({Workflow}='HIBOU_SOCIAL_GATEWAY_V1',FIND('${escFormula(needle)}',{Notes})>0)`,
    pageSize: 5,
    priorityAware: false,
  });
}

async function markTikTokAuthorizationRemoved(event) {
  const credential = await loadSocialCredential("tiktok", "primary", process.env).catch(() => null);
  if (!credential) return { updated: false, reason: "credential_not_connected" };
  await storeSocialCredential({
    provider: "tiktok",
    accountKey: credential.accountKey,
    payload: credential.payload,
    scopes: credential.scopes,
    expiresAt: credential.expiresAt,
    status: "Needs reauth",
    error: `TikTok authorization.removed${event.reason ? ` · reason ${event.reason}` : ""}`,
  }, process.env);
  return { updated: true };
}

export async function POST(request) {
  const rawBody = await request.text();
  const verification = verifyTikTokWebhookSignature(
    request.headers.get("TikTok-Signature") || "",
    rawBody,
    process.env.TIKTOK_CLIENT_SECRET || "",
  );
  if (!verification.ok) {
    const status = verification.reason === "client_secret_missing" ? 503 : 401;
    return NextResponse.json({ ok: false, error: verification.reason }, { status });
  }

  let event;
  try {
    event = parseTikTokWebhook(rawBody);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const configuredClientKey = clean(process.env.TIKTOK_CLIENT_KEY);
  if (configuredClientKey && event.client_key && event.client_key !== configuredClientKey) {
    return NextResponse.json({ ok: false, error: "client_key_mismatch" }, { status: 401 });
  }

  if (event.event === "authorization.removed") {
    const authorization = await markTikTokAuthorizationRemoved(event).catch((error) => ({
      updated: false,
      reason: String(error?.message || error).slice(0, 300),
    }));
    return NextResponse.json({ ok: true, event: event.event, authorization, acknowledged: true });
  }

  const supported = new Set([
    "post.publish.complete",
    "post.publish.failed",
    "post.publish.inbox_delivered",
    "post.publish.publicly_available",
    "post.publish.no_longer_publicaly_available",
  ]);
  if (!supported.has(event.event)) {
    return NextResponse.json({ ok: true, ignored: true, event: event.event, acknowledged: true });
  }
  if (!event.publish_id) {
    return NextResponse.json({ ok: true, ignored: true, event: event.event, reason: "publish_id_missing", acknowledged: true });
  }

  const records = await socialJournalForPublishId(event.publish_id);
  let updated = 0;
  let duplicates = 0;
  for (const record of records) {
    if (tikTokWebhookAlreadyApplied(record, event)) {
      duplicates += 1;
      continue;
    }
    const fields = journalFieldsForTikTokWebhook(record, event);
    if (!fields) continue;
    await updateRecord(TABLES.journal, record.id, fields);
    updated += 1;
  }

  // TikTok uses at-least-once delivery. A signed event is acknowledged even when the
  // matching dispatch journal is not present yet; polling remains the second reconciliation path.
  return NextResponse.json({
    ok: true,
    acknowledged: true,
    event: event.event,
    publish_id: event.publish_id,
    matched: records.length,
    updated,
    duplicates,
  });
}
