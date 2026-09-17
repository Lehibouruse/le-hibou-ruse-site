import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createRecord, queryRecords, TABLES, updateRecord } from "../../../../lib/airtable";
import { escapeFormula } from "../../../../lib/commerce.mjs";
import { resolveDigifyWebhookAuth } from "../../../../lib/digify-config.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function secureEqual(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right);
}

function basicAuthorized(request) {
  let expected;
  try { expected = resolveDigifyWebhookAuth(process.env); }
  catch { return false; }
  if (!expected.username || !expected.password) return false;
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Basic ")) return false;
  let decoded = "";
  try { decoded = Buffer.from(auth.slice(6), "base64").toString("utf8"); } catch { return false; }
  const split = decoded.indexOf(":");
  if (split < 0) return false;
  return secureEqual(decoded.slice(0, split), expected.username) && secureEqual(decoded.slice(split + 1), expected.password);
}

function safeEventTime(value) {
  const ms = Date.parse(String(value || ""));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : new Date().toISOString();
}

function safeDigifyLink(value) {
  const raw = String(value || "").trim();
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

async function journal(event, status, note, saleId = "") {
  await createRecord(TABLES.journal, {
    Workflow: "HIBOU_DIGIFY_WEBHOOK_V1",
    Déclencheur: "Digify",
    Action: `${event.type || "Event"} · ${event.fileGuid || "no-file"}`,
    Statut: status,
    "Dernière exécution": event.eventTime || new Date().toISOString(),
    "ID externe": saleId,
    "URL résultat": event.link || "",
    Erreur: ["Unmatched", "Rejected", "Policy Alert"].includes(status) ? String(note).slice(0, 5000) : "",
    Notes: String(note).slice(0, 10000),
  }).catch(() => {});
}

export async function POST(request) {
  if (!basicAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Hibou Digify Webhook"' } });
  }

  let payload;
  try { payload = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }

  const rawLink = String(payload?.Link || "").trim();
  const link = safeDigifyLink(rawLink);
  const event = {
    type: String(payload?.Type || ""),
    eventTime: safeEventTime(payload?.EventTime),
    fileGuid: String(payload?.FileGUID || "").trim(),
    fileName: String(payload?.FileName || ""),
    email: String(payload?.RecipientUserEmail || "").trim().toLowerCase(),
    link,
    accessType: String(payload?.AccessType || ""),
  };
  if (!event.fileGuid || !["View", "Print", "Download"].includes(event.type)) {
    return NextResponse.json({ ok: false, error: "Unsupported Digify event" }, { status: 422 });
  }
  if (rawLink && !link) {
    await journal(event, "Rejected", "Lien Digify webhook hors domaine HTTPS Digify refusé");
    return NextResponse.json({ ok: false, error: "Invalid Digify link" }, { status: 422 });
  }
  if (!event.email) {
    await journal(event, "Unmatched", "Événement Digify sans RecipientUserEmail; rattachement refusé");
    return NextResponse.json({ ok: true, matched: false, reason: "missing_recipient_email" });
  }

  const clauses = [
    `{Digify File GUID}='${escapeFormula(event.fileGuid)}'`,
    `{Digify recipient email}='${escapeFormula(event.email)}'`,
    "{Livraison statut}='delivered'",
  ];
  const matches = await queryRecords(TABLES.sales, {
    filterByFormula: `AND(${clauses.join(",")})`,
    pageSize: 2,
  });
  const sale = matches.length === 1 ? matches[0] : null;
  if (!sale) {
    await journal(event, "Unmatched", `Événement non rattaché de manière unique; matches=${matches.length}; email=${event.email}`);
    return NextResponse.json({ ok: true, matched: false });
  }

  const policyViolation = event.type === "Print" || event.type === "Download";
  const fields = {
    "Dernière activité Digify": event.eventTime,
    ...(event.link && !sale.fields?.["Digify access URL"] ? { "Digify access URL": event.link } : {}),
  };
  if (event.type === "View") {
    fields["Vues Digify"] = Number(sale.fields?.["Vues Digify"] || 0) + 1;
    if (!sale.fields?.["Première consultation"]) fields["Première consultation"] = event.eventTime;
  } else if (event.type === "Print") {
    fields["Impressions Digify"] = Number(sale.fields?.["Impressions Digify"] || 0) + 1;
  } else if (event.type === "Download") {
    fields["Téléchargements Digify"] = Number(sale.fields?.["Téléchargements Digify"] || 0) + 1;
  }
  await updateRecord(TABLES.sales, sale.id, fields);
  const note = policyViolation
    ? `${event.type} reçu alors que la politique Hibou désactive impression/téléchargement; vérifier immédiatement la configuration Digify · vente ${sale.id}`
    : `${event.type} rattaché à la vente ${sale.id}; access=${event.accessType}; file=${event.fileName}`;
  await journal(event, policyViolation ? "Policy Alert" : "Completed", note, sale.id);
  return NextResponse.json({ ok: true, matched: true, sale_id: sale.id, type: event.type, policy_alert: policyViolation });
}
