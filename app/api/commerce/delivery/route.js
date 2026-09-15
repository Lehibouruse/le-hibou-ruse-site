import { NextResponse } from "next/server";
import { createRecord, getRecord, queryRecords, TABLES, updateRecord } from "../../../../lib/airtable";
import { addDigifyRecipient, escapeFormula } from "../../../../lib/commerce.mjs";
import { verifyGithubActionsToken } from "../../../../lib/github-oidc.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function journal(sale, status, note, url = "") {
  await createRecord(TABLES.journal, {
    Workflow: "HIBOU_DIGIFY_DELIVERY_V1",
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
  const records = await queryRecords(TABLES.products, {
    filterByFormula: `AND({Actif}=1,{Produit}='${safe}')`,
    pageSize: 2,
  });
  return records[0] || null;
}

async function currentEdition() {
  const records = await queryRecords(TABLES.configuration, {
    filterByFormula: "AND({Actif}=1,{Clé}='book_current_edition')",
    pageSize: 1,
  });
  return String(records[0]?.fields?.Valeur || "V1.0");
}

export async function POST(request) {
  try {
    const auth = request.headers.get("authorization") || "";
    if (!auth.startsWith("Bearer ")) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    await verifyGithubActionsToken(auth.slice("Bearer ".length));
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error?.message || "Unauthorized").slice(0, 300) }, { status: 401 });
  }

  const pending = await queryRecords(TABLES.sales, {
    filterByFormula: "AND({Livraison statut}='pending',{Statut}='paid')",
    pageSize: 1,
  });
  const candidate = pending[0];
  if (!candidate) {
    return NextResponse.json({
      ok: true,
      processed: 0,
      reason: "no_pending_delivery",
      configured: Boolean(process.env.DIGIFY_KEY_ID && process.env.DIGIFY_SECRET && process.env.DIGIFY_ADD_RECIPIENT_BODY_TEMPLATE),
    });
  }

  const attempts = Number(candidate.fields?.["Livraison tentatives"] || 0) + 1;
  if (attempts > 3) {
    await updateRecord(TABLES.sales, candidate.id, {
      "Livraison statut": "manual_review",
      "Livraison erreur": "Plus de 3 tentatives de livraison Digify.",
    });
    await journal(candidate, "Manual Review", "Plus de 3 tentatives de livraison Digify.");
    return NextResponse.json({ ok: true, processed: 1, status: "manual_review" });
  }

  await updateRecord(TABLES.sales, candidate.id, {
    "Livraison statut": "processing",
    "Livraison tentatives": attempts,
    "Livraison erreur": "",
  });
  const current = await getRecord(TABLES.sales, candidate.id);
  if (String(current.fields?.["Livraison statut"] || "") !== "processing" || Number(current.fields?.["Livraison tentatives"] || 0) !== attempts) {
    return NextResponse.json({ ok: true, processed: 0, reason: "delivery_claim_lost" });
  }

  const product = await productForSale(current);
  const fileGuid = String(product?.fields?.["Digify File GUID"] || "").trim();
  const email = String(current.fields?.["Digify recipient email"] || current.fields?.["Email client"] || "").trim().toLowerCase();
  const orderId = String(current.fields?.["ID commande externe"] || "");
  if (!product || !fileGuid || !email) {
    const reason = !product ? "Produit actif introuvable" : !fileGuid ? "Digify File GUID absent" : "Email destinataire absent";
    await updateRecord(TABLES.sales, current.id, { "Livraison statut": "manual_review", "Livraison erreur": reason });
    await journal(current, "Manual Review", reason);
    return NextResponse.json({ ok: true, processed: 1, status: "manual_review", reason });
  }

  try {
    const [delivered, edition] = await Promise.all([
      addDigifyRecipient({ fileGuid, email, orderId }),
      currentEdition(),
    ]);
    const url = delivered.accessUrl || String(process.env.DIGIFY_GENERIC_FILE_URL || "");
    await updateRecord(TABLES.sales, current.id, {
      "Livraison statut": "delivered",
      "Digify recipient email": email,
      "Digify File GUID": fileGuid,
      "Version livre livrée": edition,
      ...(url ? { "Digify access URL": url } : {}),
      "Livré le": new Date().toISOString(),
      "Livraison erreur": url ? "" : "Accès créé; l'API n'a pas renvoyé de lien individuel. La notification Digify doit être activée dans le template API.",
    });
    await journal(current, "Completed", `Accès Digify créé · édition ${edition}${url ? " · URL enregistrée" : ""}`, url);
    return NextResponse.json({ ok: true, processed: 1, status: "delivered", edition, access_url_recorded: Boolean(url) });
  } catch (error) {
    const retryable = error?.retryable !== false && attempts < 3;
    const message = String(error?.message || error).slice(0, 5000);
    await updateRecord(TABLES.sales, current.id, {
      "Livraison statut": retryable ? "pending" : "manual_review",
      "Livraison erreur": message,
    });
    await journal(current, retryable ? "Retry" : "Manual Review", message);
    return NextResponse.json({ ok: retryable, processed: 1, status: retryable ? "retry" : "manual_review", error: message }, { status: retryable ? 200 : 422 });
  }
}
