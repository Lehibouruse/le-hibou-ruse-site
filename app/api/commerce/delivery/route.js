import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createRecord, getRecord, queryRecords, TABLES, updateRecord } from "../../../../lib/airtable";
import { addDigifyRecipient, escapeFormula, saleIsRefunded } from "../../../../lib/commerce.mjs";
import { clearCommerceLease, commerceClaimPatch, commercePendingFormula, commerceStaleFormula, ownsCommerceLease } from "../../../../lib/commerce-lease.mjs";
import { verifyGithubActionsToken } from "../../../../lib/github-oidc.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const OIDC_WORKFLOW = "hibou-wake.yml";
const COMMERCE_WORKFLOW = "commerce-queue.yml";
const ALLOWED_EVENTS = ["schedule", "workflow_dispatch"];

function truthy(value) {
  return ["1", "true", "yes", "oui", "on"].includes(String(value ?? "").trim().toLowerCase());
}

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

async function commerceLaunchAuthorized() {
  const records = await queryRecords(TABLES.configuration, {
    filterByFormula: "AND({Actif}=1,{Clé}='commerce_launch_authorized')",
    pageSize: 1,
    priorityAware: false,
  });
  return truthy(records[0]?.fields?.Valeur);
}

async function activeConfigurationValue(key, fallback = "") {
  const safe = escapeFormula(key);
  const records = await queryRecords(TABLES.configuration, {
    filterByFormula: `AND({Actif}=1,{Clé}='${safe}')`,
    pageSize: 1,
    priorityAware: false,
  });
  const value = String(records[0]?.fields?.Valeur ?? "").trim();
  return value || fallback;
}

async function deliveryProviderMode() {
  const mode = (await activeConfigurationValue("delivery_provider_mode", "digify")).toLowerCase();
  return ["digify", "lemon_native"].includes(mode) ? mode : "invalid";
}

async function lemonNativeDeliveryVerified() {
  return truthy(await activeConfigurationValue("lemon_native_delivery_verified", "false"));
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

async function deliveryOrderGuard(current) {
  const orderId = String(current.fields?.["ID commande externe"] || "").trim();
  if (!orderId) return { safe: false, reason: "ID commande externe absent" };
  const safe = escapeFormula(orderId);
  const matches = await queryRecords(TABLES.sales, {
    filterByFormula: `{ID commande externe}='${safe}'`,
    pageSize: 10,
  });
  const refunded = matches.find((record) => saleIsRefunded(record.fields));
  if (refunded) {
    return {
      safe: false,
      refunded: true,
      refundAt: String(refunded.fields?.Remboursement || "").trim(),
      reason: `Commande ${orderId} remboursée sur ${refunded.id}; livraison bloquée`,
      duplicates: Math.max(0, matches.length - 1),
    };
  }
  if (matches.length !== 1) {
    return {
      safe: false,
      refunded: false,
      reason: `Commande ${orderId}: ${matches.length} enregistrements trouvés; livraison bloquée jusqu'à réconciliation`,
      duplicates: Math.max(0, matches.length - 1),
    };
  }
  return { safe: true, duplicates: 0, canonical_id: current.id };
}

export async function POST(request) {
  try {
    const auth = request.headers.get("authorization") || "";
    if (!auth.startsWith("Bearer ")) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    await verifyGithubActionsToken(auth.slice("Bearer ".length), {
      allowedWorkflowFiles: [OIDC_WORKFLOW, COMMERCE_WORKFLOW],
      allowedEvents: ALLOWED_EVENTS,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error?.message || "Unauthorized").slice(0, 300) }, { status: 401 });
  }

  const staleId = await clearStaleDelivery();
  if (staleId) return NextResponse.json({ ok: true, processed: 1, status: "manual_review", reason: "stale_delivery_ambiguous", sale_id: staleId });

  const provider = await deliveryProviderMode();
  const configured = provider === "digify"
    ? Boolean(process.env.DIGIFY_KEY_ID && process.env.DIGIFY_SECRET)
    : provider === "lemon_native"
      ? await lemonNativeDeliveryVerified()
      : false;
  if (!(await commerceLaunchAuthorized())) {
    return NextResponse.json({ ok: true, processed: 0, reason: "commerce_launch_not_authorized", configured, provider });
  }
  if (provider === "invalid") {
    return NextResponse.json({ ok: false, processed: 0, reason: "delivery_provider_invalid", configured: false }, { status: 422 });
  }
  if (!configured) {
    const reason = provider === "lemon_native" ? "lemon_native_delivery_not_verified" : "delivery_not_configured";
    return NextResponse.json({ ok: true, processed: 0, reason, configured: false, provider });
  }

  const pending = await queryRecords(TABLES.sales, { filterByFormula: commercePendingFormula("delivery"), pageSize: 1 });
  const candidate = pending[0];
  if (!candidate) {
    return NextResponse.json({ ok: true, processed: 0, reason: "no_pending_delivery", configured });
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

  const guard = await deliveryOrderGuard(current);
  if (!guard.safe) {
    const patch = guard.refunded
      ? {
          Statut: "refunded",
          Remboursement: guard.refundAt || new Date().toISOString(),
          "Livraison statut": "revoked",
          "Livraison erreur": guard.reason,
        }
      : { "Livraison statut": "manual_review", "Livraison erreur": guard.reason };
    await updateRecord(TABLES.sales, current.id, clearCommerceLease(patch));
    await journal(current, guard.refunded ? "Completed" : "Manual Review", guard.reason);
    return NextResponse.json({
      ok: true,
      processed: 1,
      status: guard.refunded ? "revoked" : "manual_review",
      reason: guard.refunded ? "refund_guard" : "duplicate_order_guard",
      duplicate_records: guard.duplicates || 0,
    });
  }

  const product = await productForSale(current);
  const fileGuid = String(current.fields?.["Digify File GUID"] || product?.fields?.["Digify File GUID"] || "").trim();
  const email = String(current.fields?.["Digify recipient email"] || current.fields?.["Email client"] || "").trim().toLowerCase();
  const orderId = String(current.fields?.["ID commande externe"] || "");
  const snapshottedEdition = String(current.fields?.["Version livre livrée"] || "").trim();
  const edition = snapshottedEdition || await currentEdition();

  if (provider === "lemon_native") {
    if (!email || !finalEdition(edition)) {
      const reason = !email ? "Email client absent" : `Édition livre non finale: ${edition || "absente"}`;
      await updateRecord(TABLES.sales, current.id, clearCommerceLease({ "Livraison statut": "manual_review", "Livraison erreur": reason }));
      await journal(current, "Manual Review", reason);
      return NextResponse.json({ ok: true, processed: 1, status: "manual_review", reason, provider });
    }
    const note = "Livraison native Lemon: contenu remis par le reçu/My Orders. Ce mode n'offre pas la preuve de watermark ni la révocation nominative Digify.";
    await updateRecord(TABLES.sales, current.id, clearCommerceLease({
      "Livraison statut": "delivered",
      "Version livre livrée": edition,
      "Livré le": new Date().toISOString(),
      "Livraison erreur": note,
    }));
    await journal(current, "Completed", `Livraison Lemon native · édition ${edition} · accès géré par Lemon My Orders`, "https://app.lemonsqueezy.com/my-orders");
    return NextResponse.json({
      ok: true,
      processed: 1,
      status: "delivered",
      provider,
      edition,
      delivery_surface: "lemon_my_orders",
      limitations: ["no_digify_watermark", "no_proven_individual_refund_revocation"],
    });
  }

  if (!fileGuid || !email || !finalEdition(edition)) {
    const reason = !fileGuid ? "Digify File GUID absent de la vente et du produit" : !email ? "Email destinataire absent" : `Édition livre non finale: ${edition || "absente"}`;
    await updateRecord(TABLES.sales, current.id, clearCommerceLease({ "Livraison statut": "manual_review", "Livraison erreur": reason }));
    await journal(current, "Manual Review", reason);
    return NextResponse.json({ ok: true, processed: 1, status: "manual_review", reason });
  }

  try {
    const delivered = await addDigifyRecipient({ fileGuid, email, orderId });
    const url = delivered.accessUrl || "";
    await updateRecord(TABLES.sales, current.id, clearCommerceLease({
      "Livraison statut": "delivered",
      "Digify recipient email": email,
      "Digify File GUID": fileGuid,
      "Version livre livrée": edition,
      ...(url ? { "Digify access URL": url } : {}),
      "Livré le": new Date().toISOString(),
      "Livraison erreur": url ? "" : "Accès nominatif créé; l'API n'a pas renvoyé de Quick Access Link. La notification Digify doit être activée pour ce destinataire.",
    }));
    // A signed refund may have arrived during the external Digify call.
    // Recheck after persisting the recipient so the next queue pass removes it.
    const afterDelivery = await getRecord(TABLES.sales, current.id);
    if (saleIsRefunded(afterDelivery.fields)) {
      await updateRecord(TABLES.sales, current.id, {
        "Livraison statut": "revocation_pending",
        "Livraison erreur": "Remboursement reçu pendant la livraison; retrait Digify en attente.",
      });
      await journal(current, "Completed", "Accès créé pendant un remboursement; révocation Digify mise en attente", url);
      return NextResponse.json({ ok: true, processed: 1, status: "revocation_pending", edition, access_url_recorded: Boolean(url) });
    }
    await journal(current, "Completed", `Accès Digify nominatif créé · édition ${edition}${url ? " · Quick Access Link enregistré" : " · notification Digify requise"}`, url);
    return NextResponse.json({ ok: true, processed: 1, status: "delivered", edition, access_url_recorded: Boolean(url) });
  } catch (error) {
    const retryable = error?.retryable === true && attempts < 3;
    const message = String(error?.message || error).slice(0, 5000);
    await updateRecord(TABLES.sales, current.id, clearCommerceLease({
      "Livraison statut": retryable ? "pending" : "manual_review",
      "Livraison erreur": message,
    }));
    await journal(current, retryable ? "Retry" : "Manual Review", message);
    return NextResponse.json({ ok: retryable, processed: 1, status: retryable ? "retry" : "manual_review", error: message }, { status: retryable ? 200 : 422 });
  }
}
