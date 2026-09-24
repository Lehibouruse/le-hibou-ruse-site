import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createRecord, queryRecords, TABLES } from "../../../lib/airtable";
import { escapeFormula } from "../../../lib/commerce.mjs";

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

  const existing = await queryRecords(TABLES.withdrawals, {
    filterByFormula: `AND({E-mail accusé}='${escapeFormula(email)}',{Référence contrat}='${escapeFormula(contractReference)}')`,
    pageSize: 1,
  });
  if (existing.length) {
    const fields = existing[0].fields || {};
    const requestId = clean(fields["Demande ID"], 180);
    const submittedAt = clean(fields["Date demande"], 180);
    return json({
      ok: true,
      deduplicated: true,
      request_id: requestId,
      submitted_at: submittedAt,
      receipt_text: receiptText({ requestId, submittedAt, firstName, lastName, email, contractReference }),
    });
  }

  const requestId = randomUUID();
  const submittedAt = new Date().toISOString();
  await createRecord(TABLES.withdrawals, {
    "Demande ID": requestId,
    "Date demande": submittedAt,
    Nom: lastName,
    "Prénom": firstName,
    "E-mail accusé": email,
    "Référence contrat": contractReference,
    Statut: "Reçue",
    Notes: "Déclaration reçue via /retractation. Accusé téléchargeable rendu au navigateur. Aucun remboursement ni retrait d’accès automatique. Envoi durable externe à confirmer avant lancement.",
  });

  return json({
    ok: true,
    request_id: requestId,
    submitted_at: submittedAt,
    receipt_text: receiptText({ requestId, submittedAt, firstName, lastName, email, contractReference }),
  }, 201);
}
