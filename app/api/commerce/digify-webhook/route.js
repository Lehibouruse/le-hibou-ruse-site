import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createRecord, queryRecords, TABLES, updateRecord } from "../../../../lib/airtable";
import { escapeFormula } from "../../../../lib/commerce.mjs";
import { resolveDigifyWebhookAuth } from "../../../../lib/digify-config.mjs";
import {
  digifyWebhookAction,
  normalizeDigifyWebhookPayload,
} from "../../../../lib/digify-webhook.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DIGIFY_WEBHOOK_WORKFLOW = "HIBOU_DIGIFY_WEBHOOK_V2";

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

async function priorJournal(action) {
  const safeAction = escapeFormula(action);
  const safeWorkflow = escapeFormula(DIGIFY_WEBHOOK_WORKFLOW);
  const rows = await queryRecords(TABLES.journal, {
    filterByFormula: `AND({Workflow}='${safeWorkflow}',{Action}='${safeAction}',OR({Statut}='Completed',{Statut}='Policy Alert'))`,
    pageSize: 1,
    priorityAware: false,
  });
  return rows[0] || null;
}

async function journal(event, status, note, saleId = "") {
  const action = digifyWebhookAction(event);
  return createRecord(TABLES.journal, {
    Workflow: DIGIFY_WEBHOOK_WORKFLOW,
    Déclencheur: "Digify",
    Action: action,
    Statut: status,
    "Dernière exécution": event.eventTime || new Date().toISOString(),
    "ID externe": saleId,
    "URL résultat": event.link || "",
    Erreur: ["Unmatched", "Rejected", "Policy Alert"].includes(status) ? String(note).slice(0, 5000) : "",
    Notes: String(note).slice(0, 10000),
  }).catch(() => null);
}

export async function POST(request) {
  if (!basicAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: { "WWW-Authenticate": 'Basic realm="Hibou Digify Webhook"' } });
  }

  let payload;
  try { payload = await request.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }

  const { event, errors } = normalizeDigifyWebhookPayload(payload);
  if (errors.includes("invalid_link")) {
    await journal(event, "Rejected", "Lien Digify webhook hors domaine HTTPS Digify refusé");
    return NextResponse.json({ ok: false, error: "Invalid Digify link" }, { status: 422 });
  }
  if (errors.includes("invalid_event_time")) {
    await journal(event, "Rejected", "EventTime Digify absent ou invalide");
    return NextResponse.json({ ok: false, error: "Invalid Digify EventTime" }, { status: 422 });
  }
  if (errors.length) {
    return NextResponse.json({ ok: false, error: "Unsupported Digify event", reasons: errors }, { status: 422 });
  }
  if (!event.email) {
    await journal(event, "Unmatched", "Événement Digify sans RecipientUserEmail; rattachement refusé");
    return NextResponse.json({ ok: true, matched: false, reason: "missing_recipient_email" });
  }

  const action = digifyWebhookAction(event);
  const duplicate = await priorJournal(action);
  if (duplicate) {
    return NextResponse.json({
      ok: true,
      duplicate: true,
      matched: Boolean(duplicate.fields?.["ID externe"]),
      sale_id: duplicate.fields?.["ID externe"] || "",
      type: event.type,
    });
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
  return NextResponse.json({
    ok: true,
    matched: true,
    duplicate: false,
    sale_id: sale.id,
    type: event.type,
    policy_alert: policyViolation,
  });
}
