import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createRecord, queryRecords, updateRecord, TABLES } from "../../../lib/airtable";
import { escapeFormula } from "../../../lib/commerce.mjs";
import { sendWithdrawalReceipt } from "../../../lib/withdrawal-receipt.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 10_000;
const ALLOWED_ORIGINS = new Set([
  "https://d4d5d6.com",
  "https://www.d4d5d6.com",
  "https://le-hibou-ruse-site.vercel.app",
]);

function clean(value, max = 180) {
  return String(value || "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);
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
  try { return ALLOWED_ORIGINS.has(new URL(origin).origin); }
  catch { return false; }
}

function receiptText({ requestId, submittedAt, firstName, lastName, email, contractReference }) {
  return [
    "LE HIBOU RUSÉ — ACCUSÉ DE DÉPÔT D’UNE DÉCLARATION DE RÉTRACTATION",
    "",
    `Référence de la demande : ${requestId}`,
    `Date et heure d’envoi : ${submittedAt}`,
    `Prénom : ${firstName}`,
    `Nom : ${lastName}`,
    `Référence du contrat : ${contractReference}`,
    `Moyen électronique indiqué pour l’accusé : ${email}`,
    "",
    "Votre déclaration de rétractation a été enregistrée.",
    "Cet accusé atteste la transmission de votre déclaration. Il ne préjuge pas de l’existence ou du maintien du droit de rétractation pour le contrat concerné, notamment lorsqu’un contenu numérique a déjà commencé à être fourni dans les conditions légales applicables.",
    "Aucun numéro de carte bancaire, mot de passe ou pièce d’identité n’est nécessaire pour cette démarche.",
  ].join("\n");
}

async function recordReceiptDelivery(recordId, fields, requestId) {
  if (!recordId) return false;
  try {
    await updateRecord(TABLES.withdrawals, recordId, fields);
    return true;
  } catch {
    console.error("Withdrawal receipt tracking update failed", requestId);
    return false;
  }
}

async function referencedSales(contractReference) {
  const safe = escapeFormula(contractReference);
  return queryRecords(TABLES.sales, {
    filterByFormula: `OR({ID commande externe}='${safe}',{Identifiant commande public}='${safe}')`,
    pageSize: 5,
    priorityAware: false,
  });
}

function uniqueSaleForEmail(sales, email) {
  const expected = String(email || "").trim().toLowerCase();
  const matches = (sales || []).filter((sale) => String(sale?.fields?.["Email client"] || "").trim().toLowerCase() === expected);
  return matches.length === 1 ? matches[0] : null;
}

export async function POST(request) {
  if (!allowedOrigin(request)) return json({ ok: false, error: "Origin refused" }, 403);
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) return json({ ok: false, error: "Format invalide" }, 415);
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) return json({ ok: false, error: "Requête trop volumineuse" }, 413);

  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return json({ ok: false, error: "Requête trop volumineuse" }, 413);
  let body;
  try { body = JSON.parse(raw); }
  catch { return json({ ok: false, error: "JSON invalide" }, 400); }

  if (body.company) return json({ ok: true, ignored: true });
  const firstName = clean(body.first_name, 120);
  const lastName = clean(body.last_name, 120);
  const email = clean(body.email, 160).toLowerCase();
  const contractReference = clean(body.contract_reference, 180);
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!firstName || !lastName || !validEmail || !contractReference) {
    return json({ ok: false, error: "Données invalides" }, 422);
  }

  const requestId = randomUUID();
  const submittedAt = new Date().toISOString();
  const receipt = receiptText({ requestId, submittedAt, firstName, lastName, email, contractReference });
  const created = await createRecord(TABLES.withdrawals, {
    "Demande ID": requestId,
    "Date demande": submittedAt,
    Nom: lastName,
    "Prénom": firstName,
    "E-mail accusé": email,
    "Référence contrat": contractReference,
    Statut: "Reçue",
    Notes: "Déclaration reçue via /retractation. Accusé téléchargeable rendu au navigateur. Aucun remboursement ni retrait d’accès automatique. L’accusé durable e-mail n’est marqué envoyé qu’après vérification vente/e-mail et confirmation 2xx du webhook transactionnel.",
  });
  const recordId = created?.records?.[0]?.id || "";

  let sale = null;
  try {
    sale = uniqueSaleForEmail(await referencedSales(contractReference), email);
  } catch {
    console.error("Withdrawal sale verification unavailable", requestId);
  }

  if (!sale) {
    await recordReceiptDelivery(recordId, {
      Statut: "À vérifier",
      Notes: "Déclaration reçue via /retractation. L’envoi durable automatique est retenu car la référence de contrat et l’e-mail n’ont pas pu être rattachés sans ambiguïté à une vente. La demande reste enregistrée et le reçu téléchargeable reste disponible. Vérification humaine requise ; aucun remboursement ni retrait d’accès automatique.",
    }, requestId);
    return json({
      ok: true,
      request_id: requestId,
      submitted_at: submittedAt,
      receipt_text: receipt,
      durable_receipt: "verification_required",
      durable_receipt_tracking: "not_sent",
    }, 201);
  }

  const delivery = await sendWithdrawalReceipt({
    request_id: requestId,
    submitted_at: submittedAt,
    first_name: firstName,
    last_name: lastName,
    email,
    contract_reference: contractReference,
    receipt_text: receipt,
  });

  let trackingRecorded = false;
  if (delivery.ok) {
    const sentAt = new Date().toISOString();
    trackingRecorded = await recordReceiptDelivery(recordId, {
      Statut: "Accusé envoyé",
      "Accusé envoyé le": sentAt,
      "Canal accusé": "E-mail",
      Notes: "Déclaration reçue via /retractation. Référence et e-mail rattachés à une vente. Accusé durable transmis par le webhook transactionnel configuré ; réponse 2xx reçue. Aucun remboursement ni retrait d’accès automatique.",
    }, requestId);
  } else if (delivery.configured) {
    trackingRecorded = await recordReceiptDelivery(recordId, {
      Statut: "À vérifier",
      Notes: `Déclaration reçue via /retractation. Référence et e-mail rattachés à une vente, mais échec de l’accusé durable transactionnel (${delivery.code}). La demande reste enregistrée et le reçu téléchargeable reste disponible. Vérification humaine requise ; aucun remboursement ni retrait d’accès automatique.`,
    }, requestId);
  }

  return json({
    ok: true,
    request_id: requestId,
    submitted_at: submittedAt,
    receipt_text: receipt,
    durable_receipt: delivery.ok ? "sent" : delivery.configured ? "delivery_failed" : "not_configured",
    durable_receipt_tracking: delivery.ok ? (trackingRecorded ? "recorded" : "tracking_failed") : "not_sent",
  }, 201);
}
