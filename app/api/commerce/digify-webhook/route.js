import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createRecord, queryRecords, TABLES, updateRecord } from "../../../../lib/airtable";
import { escapeFormula } from "../../../../lib/commerce.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function secureEqual(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right);
}

function basicAuthorized(request) {
  const expectedUser = process.env.DIGIFY_WEBHOOK_USERNAME || "";
  const expectedPassword = process.env.DIGIFY_WEBHOOK_PASSWORD || "";
  if (!expectedUser || !expectedPassword) return false;
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Basic ")) return false;
  let decoded = "";
  try { decoded = Buffer.from(auth.slice(6), "base64").toString("utf8"); } catch { return false; }
  const split = decoded.indexOf(":");
  if (split < 0) return false;
  return secureEqual(decoded.slice(0, split), expectedUser) && secureEqual(decoded.slice(split + 1), expectedPassword);
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
    Erreur: status === "Unmatched" ? String(note).slice(0, 5000) : "",
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

  const event = {
    type: String(payload?.Type || ""),
    eventTime: String(payload?.EventTime || new Date().toISOString()),
    fileGuid: String(payload?.FileGUID || ""),
    fileName: String(payload?.FileName || ""),
    email: String(payload?.RecipientUserEmail || "").trim().toLowerCase(),
    link: String(payload?.Link || ""),
    accessType: String(payload?.AccessType || ""),
  };
  if (!event.fileGuid || !["View", "Print", "Download"].includes(event.type)) {
    return NextResponse.json({ ok: false, error: "Unsupported Digify event" }, { status: 422 });
  }

  const clauses = [`{Digify File GUID}='${escapeFormula(event.fileGuid)}'`, "{Livraison statut}='delivered'"];
  if (event.email) clauses.push(`{Digify recipient email}='${escapeFormula(event.email)}'`);
  const matches = await queryRecords(TABLES.sales, {
    filterByFormula: `AND(${clauses.join(",")})`,
    pageSize: 2,
  });
  const sale = matches.length === 1 ? matches[0] : null;
  if (!sale) {
    await journal(event, "Unmatched", `Événement non rattaché de manière unique; matches=${matches.length}; email=${event.email || "absent"}`);
    return NextResponse.json({ ok: true, matched: false });
  }

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
  await journal(event, "Completed", `${event.type} rattaché à la vente ${sale.id}; access=${event.accessType}; file=${event.fileName}`, sale.id);
  return NextResponse.json({ ok: true, matched: true, sale_id: sale.id, type: event.type });
}
