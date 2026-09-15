import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createRecord, getRecord, queryRecords, TABLES, updateRecord } from "../../../../lib/airtable";
import { addDigifyRecipient, escapeFormula } from "../../../../lib/commerce.mjs";
import { clearCommerceLease, commerceClaimPatch, commercePendingFormula, commerceStaleFormula, ownsCommerceLease } from "../../../../lib/commerce-lease.mjs";
import { verifyGithubActionsToken } from "../../../../lib/github-oidc.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function journal(sale, status, note, url = "") {
  await createRecord(TABLES.journal, {
    Workflow: "HIBOU_DIGIFY_DELIVERY_V2",
    Déclencheur: "Ventes",
    Action: `DELIVER_EBOOK · ${sale.fields?.["ID commande externe"] || sale.id}`,
    Statut: status,
    "Dernière exécution": new Date().toISOString(),
    "ID externe": sale.id,
    "URL résultat": url,
    Erreur: status === "Error" || status === "Manual Review" ? String(note).slice(0, 5000) : "",
    Notes: String(note).slice(0, 10000),
  }).catch(() => {});
}

async function productForSale(sale) {
  const name = String(sale.fields?.Produit || "");
  if (!name) return null;
  const safe = escapeFormula(name);
  const records = await queryRecords(TABLES.products, { filterByFormula: `AND({Actif}=1,{Produit}='${safe}')`, pageSize: 2 });
  return records[0] || null;
}

async function currentEdition() {
  const records = await queryRecords(TABLES.configuration, { filterByFormula: "AND({Actif}=1,{Clé}='book_current_edition')", pageSize: 1 });
  return String(records[0]?.fields?.Valeur || "V1.0").trim();
}

function finalEdition(value) {
  const edition = String(value || "").trim();
  return Boolean(edition && !edition.toLowerCase().includes("draft"));
}

async function clearStaleDelivery() {
  const stale = await queryRecords(TABLES.sales, { filterByFormula: commerceStaleFormula("delivery"), pageSize: 1 });
  const sale = stale[0];
  if (!sale) return null;
  const reason = "Livraison Digify interrompue après prise de bail : effet externe ambigu. Vérifier Digify avant toute nouvelle tentative.";
  await updateRecord(TABLES.sales, sale.id, clearCommerceLease({ "Livraison statut": "manual_review", "Livraison erreur": reason }));
  await journal(sale, "Manual Review", reason);
  return sale.id;
}

export async function POST(request) {
  try {
    const auth = request.headers.get("authorization") || "";
    if (!auth.startsWith("Bearer ")) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    await verifyGithubActionsToken(auth.slice("Bearer ".length));
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error?.message || "Unauthorized").slice(0, 300) }, { status: 401 });
  }

  const staleId = await clearStaleDelivery();
  if (staleId) return NextResponse.json({ ok: true, processed: 1, status: "manual_review", reason: "stale_delivery_ambiguous", sale_id: staleId });

  const pending = await queryRecords(TABLES.sales, { filterByFormula: commercePendingFormula("delivery"), pageSize: 1 });
  const candidate = pending[0];
  if (!candidate) {
    return NextResponse.json({
      ok: true, processed: 0, reason: "no_pending_delivery",
      configured: Boolean(process.env.DIGIFY_KEY_ID && process.env.DIGIFY_SECRET && process.env.DIGIFY_ADD_RECIPIENT_BODY_TEMPLATE),
    });
  }

  const attempts = Number(candidate.fields?.["Livraison tentatives"] || 0) + 1;
  if (attempts > 3) {
    await updateRecord(TABLES.sales, candidate.id, clearCommerceLease({ "Livraison statut": "manual_review", "Livraison erreur": "Plus de 3 tentatives de livraison Digify." }));
    await journal(candidate, "Manual Review", "Plus de 3 tentatives de livraison Digify.");
    return NextResponse.json({ ok: true, processed: 1, status: "manual_review" });
  }

  const token = randomUUID();
  await updateRecord(TABLES.sales, candidate.id, commerceClaimPatch({ token, status: "processing", attempts }));
  const current = await getRecord(TABLES.sales, candidate.id);
  if (!ownsCommerceLease(current, token, "processing")) {
    return NextResponse.json({ ok: true, processed: 0, reason: "delivery_claim_lost" });
  }

  const product = await productForSale(current);
  const fileGuid = String(current.fields?.["Digify File GUID"] || product?.fields?.["Digify File GUID"] || "").trim();
  const email = String(current.fields?.["Digify recipient email"] || current.fields?.["Email client"] || "").trim().toLowerCase();
  const orderId = String(current.fields?.["ID commande externe"] || "");
  const snapshottedEdition = String(current.fields?.["Version livre livrée"] || "").trim();
  const edition = snapshottedEdition || await currentEdition();

  if (!fileGuid || !email || !finalEdition(edition)) {
    const reason = !fileGuid ? "Digify File GUID absent de la vente et du produit" : !email ? "Email destinataire absent" : `Édition livre non finale: ${edition || "absente"}`;
    await updateRecord(TABLES.sales, current.id, clearCommerceLease({ "Livraison statut": "manual_review", "Livraison erreur": reason }));
    await journal(current, "Manual Review", reason);
    return NextResponse.json({ ok: true, processed: 1, status: "manual_review", reason });
  }

  try {
    const delivered = await addDigifyRecipient({ fileGuid, email, orderId });
    const url = delivered.accessUrl || String(process.env.DIGIFY_GENERIC_FILE_URL || "");
    await updateRecord(TABLES.sales, current.id, clearCommerceLease({
      "Livraison statut": "delivered",
      "Digify recipient email": email,
      "Digify File GUID": fileGuid,
      "Version livre livrée": edition,
      ...(url ? { "Digify access URL": url } : {}),
      "Livré le": new Date().toISOString(),
      "Livraison erreur": url ? "" : "Accès créé; l'API n'a pas renvoyé de lien individuel. La notification Digify doit être activée dans le template API.",
    }));
    await journal(current, "Completed", `Accès Digify créé · édition ${edition}${url ? " · URL enregistrée" : ""}`, url);
    return NextResponse.json({ ok: true, processed: 1, status: "delivered", edition, access_url_recorded: Boolean(url) });
  } catch (error) {
    const retryable = error?.retryable !== false && attempts < 3;
    const message = String(error?.message || error).slice(0, 5000);
    await updateRecord(TABLES.sales, current.id, clearCommerceLease({
      "Livraison statut": retryable ? "pending" : "manual_review",
      "Livraison erreur": message,
    }));
    await journal(current, retryable ? "Retry" : "Manual Review", message);
    return NextResponse.json({ ok: retryable, processed: 1, status: retryable ? "retry" : "manual_review", error: message }, { status: retryable ? 200 : 422 });
  }
}
