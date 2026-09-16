import { NextResponse } from "next/server";
import { createRecord, queryRecords, TABLES, updateRecord } from "../../../../lib/airtable";
import { canonicalSale, escapeFormula, lemonOrder, saleIsRefunded, verifyLemonSignature } from "../../../../lib/commerce.mjs";
import { saleAttribution } from "../../../../lib/attribution.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function actionId(response) {
  return response?.records?.[0]?.id || "";
}

async function findSales(orderId) {
  const safe = escapeFormula(orderId);
  return queryRecords(TABLES.sales, {
    filterByFormula: `{ID commande externe}='${safe}'`,
    pageSize: 10,
  });
}

async function matchingProduct(order) {
  const products = await queryRecords(TABLES.products, {
    filterByFormula: "{Actif}=1",
    pageSize: 20,
  });
  if (!order.variantId) return null;
  return products.find((record) => String(record.fields?.["Lemon Squeezy Variant ID"] || "") === order.variantId) || null;
}

async function currentEdition() {
  const records = await queryRecords(TABLES.configuration, {
    filterByFormula: "AND({Actif}=1,{Clé}='book_current_edition')",
    pageSize: 1,
  });
  return String(records[0]?.fields?.Valeur || "").trim();
}

async function priorRefundMarker(orderId) {
  const safe = escapeFormula(orderId);
  const records = await queryRecords(TABLES.journal, {
    filterByFormula: `AND({ID externe}='${safe}',FIND('order_refunded',{Action}))`,
    pageSize: 1,
    priorityAware: false,
  });
  return records[0] || null;
}

function finalEdition(value) {
  const edition = String(value || "").trim();
  return Boolean(edition && !edition.toLowerCase().includes("draft"));
}

async function journal(order, status, note, externalId = "") {
  await createRecord(TABLES.journal, {
    Workflow: "HIBOU_LEMON_WEBHOOK_V1",
    Déclencheur: "Lemon Squeezy",
    Action: `${order.event} · ${order.identifier}`,
    Statut: status,
    "Dernière exécution": new Date().toISOString(),
    "ID externe": externalId || order.id,
    Erreur: status === "Error" ? String(note).slice(0, 5000) : "",
    Notes: String(note).slice(0, 10000),
  }).catch(() => {});
}

function attributionFields(order) {
  const attribution = saleAttribution(order.customData);
  return {
    Provenance: attribution.utm_source || "Lemon Squeezy",
    Campagne: attribution.utm_campaign || "",
    "UTM Source": attribution.utm_source || "",
    "UTM Medium": attribution.utm_medium || "",
    "UTM Content": attribution.utm_content || "",
    "Landing Page": attribution.landing_page || "",
    Referrer: attribution.referrer || "",
    attribution,
  };
}

function orderAuditNotes(order, reasons = []) {
  return [
    `identifier=${order.identifier}`,
    `product_id=${order.productId}`,
    `variant_id=${order.variantId}`,
    `test_mode=${order.testMode}`,
    ...reasons,
  ].filter(Boolean).join("; ");
}

async function recordEarlyRefund(order) {
  const attribution = attributionFields(order);
  const refundedAt = order.refundedAt || new Date().toISOString();
  const created = await createRecord(TABLES.sales, {
    Produit: order.productName || "Le Hibou Rusé",
    Date: order.createdAt,
    Montant: Number(order.total || 0),
    Devise: order.currency,
    Statut: "refunded",
    "ID commande externe": order.id,
    "Identifiant commande public": order.identifier,
    Provenance: attribution.Provenance,
    Campagne: attribution.Campagne,
    "UTM Source": attribution["UTM Source"],
    "UTM Medium": attribution["UTM Medium"],
    "UTM Content": attribution["UTM Content"],
    "Landing Page": attribution["Landing Page"],
    Referrer: attribution.Referrer,
    Remboursement: refundedAt,
    "Email client": order.email,
    Notes: orderAuditNotes(order, ["refund_before_order_created=true"]),
    "Livraison statut": "revoked",
    "Digify recipient email": order.email,
    "Livraison tentatives": 0,
    "Livraison erreur": "Remboursement reçu avant order_created; aucune livraison autorisée.",
  });
  return actionId(created);
}

export async function POST(request) {
  const raw = Buffer.from(await request.arrayBuffer());
  const signature = request.headers.get("x-signature") || "";
  const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET || "";
  if (!verifyLemonSignature(raw, signature, secret)) {
    return NextResponse.json({ ok: false, error: "Invalid signature" }, { status: 401 });
  }

  let payload;
  try { payload = JSON.parse(raw.toString("utf8")); }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }

  const order = lemonOrder(payload);
  const headerEvent = String(request.headers.get("x-event-name") || "");
  if (headerEvent && order.event && headerEvent !== order.event) {
    return NextResponse.json({ ok: false, error: "Event mismatch" }, { status: 400 });
  }
  if (!["order_created", "order_refunded"].includes(order.event)) {
    await journal(order, "Ignored", `Événement non traité: ${order.event || "unknown"}`);
    return NextResponse.json({ ok: true, ignored: true });
  }
  if (!order.id || !order.email) {
    await journal(order, "Error", "Commande sans identifiant ou email");
    return NextResponse.json({ ok: false, error: "Missing order identity" }, { status: 422 });
  }

  const matches = await findSales(order.id);
  const existing = canonicalSale(matches);

  if (order.event === "order_refunded") {
    if (!existing) {
      const saleId = await recordEarlyRefund(order);
      await journal(order, "Completed", "Remboursement enregistré avant order_created; tombstone anti-livraison créée", saleId || order.id);
      return NextResponse.json({ ok: true, refunded: true, sale_id: saleId, out_of_order: true });
    }
    const delivered = String(existing.fields?.["Livraison statut"] || "") === "delivered";
    await updateRecord(TABLES.sales, existing.id, {
      Statut: "refunded",
      "Identifiant commande public": order.identifier,
      Remboursement: order.refundedAt || new Date().toISOString(),
      "Livraison statut": delivered ? "revocation_pending" : "revoked",
      "Livraison erreur": delivered ? "Accès Digify à révoquer; automatisation de révocation non activée tant que le schéma API officiel n'est pas configuré." : "",
    });
    await journal(order, "Completed", delivered ? "Vente remboursée; révocation Digify mise en attente" : "Vente remboursée avant livraison", existing.id);
    return NextResponse.json({ ok: true, refunded: true, sale_id: existing.id, deduplicated: saleIsRefunded(existing.fields) });
  }

  if (existing && saleIsRefunded(existing.fields)) {
    const [product, edition] = await Promise.all([matchingProduct(order), currentEdition()]);
    const attribution = attributionFields(order);
    const fileGuid = String(product?.fields?.["Digify File GUID"] || existing.fields?.["Digify File GUID"] || "").trim();
    await updateRecord(TABLES.sales, existing.id, {
      Produit: String(product?.fields?.Produit || order.productName || existing.fields?.Produit || "Le Hibou Rusé"),
      Date: order.createdAt,
      Montant: Number(order.total || 0),
      Devise: order.currency,
      Statut: "refunded",
      "Identifiant commande public": order.identifier,
      Provenance: attribution.Provenance,
      Campagne: attribution.Campagne,
      "UTM Source": attribution["UTM Source"],
      "UTM Medium": attribution["UTM Medium"],
      "UTM Content": attribution["UTM Content"],
      "Landing Page": attribution["Landing Page"],
      Referrer: attribution.Referrer,
      "Email client": order.email,
      Notes: orderAuditNotes(order, ["order_created_after_refund=true"]),
      "Livraison statut": String(existing.fields?.["Livraison statut"] || "revoked"),
      "Digify recipient email": order.email,
      "Digify File GUID": fileGuid,
      "Version livre livrée": String(existing.fields?.["Version livre livrée"] || edition || ""),
    });
    await journal(order, "Completed", "order_created reçu après remboursement; vente enrichie sans réactiver la livraison", existing.id);
    return NextResponse.json({ ok: true, deduplicated: true, refunded: true, sale_id: existing.id, delivery_status: String(existing.fields?.["Livraison statut"] || "revoked") });
  }

  if (existing) {
    if (order.identifier && String(existing.fields?.["Identifiant commande public"] || "") !== order.identifier) {
      await updateRecord(TABLES.sales, existing.id, { "Identifiant commande public": order.identifier });
    }
    await journal(order, "Completed", matches.length > 1 ? `Commande déjà enregistrée; ${matches.length} enregistrements détectés, la livraison appliquera la garde anti-doublon` : "Commande déjà enregistrée (dédupliquée)", existing.id);
    return NextResponse.json({ ok: true, deduplicated: true, sale_id: existing.id, duplicate_records: Math.max(0, matches.length - 1) });
  }

  const [product, edition, refundMarker] = await Promise.all([matchingProduct(order), currentEdition(), priorRefundMarker(order.id)]);
  const fileGuid = String(product?.fields?.["Digify File GUID"] || "").trim();
  const attribution = attributionFields(order);
  const refundedBeforeCreate = Boolean(refundMarker);
  const ready = Boolean(
    product
    && fileGuid
    && order.status === "paid"
    && !order.refunded
    && !order.testMode
    && !refundedBeforeCreate
    && finalEdition(edition)
  );
  const deliveryStatus = refundedBeforeCreate ? "revoked" : ready ? "pending" : "manual_review";
  const reasons = [];
  if (!product) reasons.push(`variant Lemon ${order.variantId || "absent"} non rattaché à un produit actif`);
  if (product && !fileGuid) reasons.push("Digify File GUID absent du produit");
  if (order.status !== "paid") reasons.push(`statut Lemon=${order.status || "absent"}`);
  if (order.refunded) reasons.push("commande déjà remboursée");
  if (order.testMode) reasons.push("commande Lemon en mode test: livraison bloquée");
  if (!finalEdition(edition)) reasons.push(`édition livre non finale: ${edition || "absente"}`);
  if (refundedBeforeCreate) reasons.push("refund antérieur détecté dans le journal: livraison définitivement bloquée");

  const created = await createRecord(TABLES.sales, {
    Produit: String(product?.fields?.Produit || order.productName || "Le Hibou Rusé"),
    Date: order.createdAt,
    Montant: Number(order.total || 0),
    Devise: order.currency,
    Statut: refundedBeforeCreate ? "refunded" : (order.status || "paid"),
    "ID commande externe": order.id,
    "Identifiant commande public": order.identifier,
    Provenance: attribution.Provenance,
    Campagne: attribution.Campagne,
    "UTM Source": attribution["UTM Source"],
    "UTM Medium": attribution["UTM Medium"],
    "UTM Content": attribution["UTM Content"],
    "Landing Page": attribution["Landing Page"],
    Referrer: attribution.Referrer,
    Remboursement: refundedBeforeCreate ? (refundMarker?.createdTime || new Date().toISOString()) : "",
    "Email client": order.email,
    Notes: orderAuditNotes(order, [attribution.attribution?.utm_term ? `utm_term=${attribution.attribution.utm_term}` : "", ...reasons]),
    "Livraison statut": deliveryStatus,
    "Digify recipient email": order.email,
    "Digify File GUID": fileGuid,
    "Version livre livrée": edition,
    "Livraison tentatives": 0,
    "Livraison erreur": reasons.join("; "),
  });
  const saleId = actionId(created);
  await journal(order, ready ? "Completed" : refundedBeforeCreate ? "Completed" : "Manual Review", ready ? `Commande enregistrée; livraison Digify en attente · édition ${edition}` : reasons.join("; "), saleId);
  return NextResponse.json({ ok: true, sale_id: saleId, delivery_status: deliveryStatus, refunded: refundedBeforeCreate, attributed: Boolean(attribution.attribution?.utm_source || attribution.attribution?.utm_campaign || attribution.attribution?.utm_content) });
}
