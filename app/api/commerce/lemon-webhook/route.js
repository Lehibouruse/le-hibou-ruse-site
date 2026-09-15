import { NextResponse } from "next/server";
import { createRecord, queryRecords, TABLES, updateRecord } from "../../../../lib/airtable";
import { escapeFormula, lemonOrder, verifyLemonSignature } from "../../../../lib/commerce.mjs";
import { saleAttribution } from "../../../../lib/attribution.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function actionId(response) {
  return response?.records?.[0]?.id || "";
}

async function findSale(orderId) {
  const safe = escapeFormula(orderId);
  const records = await queryRecords(TABLES.sales, {
    filterByFormula: `{ID commande externe}='${safe}'`,
    pageSize: 2,
  });
  return records[0] || null;
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

  const existing = await findSale(order.id);
  if (order.event === "order_refunded") {
    if (!existing) {
      await journal(order, "Manual Review", "Remboursement reçu avant la commande locale");
      return NextResponse.json({ ok: true, recorded: false, reason: "sale_not_found" });
    }
    const delivered = String(existing.fields?.["Livraison statut"] || "") === "delivered";
    await updateRecord(TABLES.sales, existing.id, {
      Statut: "refunded",
      Remboursement: order.refundedAt || new Date().toISOString(),
      "Livraison statut": delivered ? "revocation_pending" : "revoked",
      "Livraison erreur": delivered ? "Accès Digify à révoquer; automatisation de révocation non activée tant que le schéma API officiel n'est pas configuré." : "",
    });
    await journal(order, "Completed", delivered ? "Vente remboursée; révocation Digify mise en attente" : "Vente remboursée avant livraison", existing.id);
    return NextResponse.json({ ok: true, refunded: true, sale_id: existing.id });
  }

  if (existing) {
    await journal(order, "Completed", "Commande déjà enregistrée (dédupliquée)", existing.id);
    return NextResponse.json({ ok: true, deduplicated: true, sale_id: existing.id });
  }

  const [product, edition] = await Promise.all([matchingProduct(order), currentEdition()]);
  const fileGuid = String(product?.fields?.["Digify File GUID"] || "").trim();
  const attribution = saleAttribution(order.customData);
  const ready = Boolean(
    product
    && fileGuid
    && order.status === "paid"
    && !order.refunded
    && !order.testMode
    && finalEdition(edition)
  );
  const deliveryStatus = ready ? "pending" : "manual_review";
  const reasons = [];
  if (!product) reasons.push(`variant Lemon ${order.variantId || "absent"} non rattaché à un produit actif`);
  if (product && !fileGuid) reasons.push("Digify File GUID absent du produit");
  if (order.status !== "paid") reasons.push(`statut Lemon=${order.status || "absent"}`);
  if (order.refunded) reasons.push("commande déjà remboursée");
  if (order.testMode) reasons.push("commande Lemon en mode test: livraison bloquée");
  if (!finalEdition(edition)) reasons.push(`édition livre non finale: ${edition || "absente"}`);

  const created = await createRecord(TABLES.sales, {
    Produit: String(product?.fields?.Produit || order.productName || "Le Hibou Rusé"),
    Date: order.createdAt,
    Montant: Number(order.total || 0),
    Devise: order.currency,
    Statut: order.status || "paid",
    "ID commande externe": order.id,
    Provenance: attribution.utm_source || "Lemon Squeezy",
    Campagne: attribution.utm_campaign || "",
    "UTM Source": attribution.utm_source || "",
    "UTM Medium": attribution.utm_medium || "",
    "UTM Content": attribution.utm_content || "",
    "Landing Page": attribution.landing_page || "",
    Referrer: attribution.referrer || "",
    Remboursement: "",
    "Email client": order.email,
    Notes: [
      `identifier=${order.identifier}`,
      `product_id=${order.productId}`,
      `variant_id=${order.variantId}`,
      `test_mode=${order.testMode}`,
      attribution.utm_term ? `utm_term=${attribution.utm_term}` : "",
      ...reasons,
    ].filter(Boolean).join("; "),
    "Livraison statut": deliveryStatus,
    "Digify recipient email": order.email,
    "Digify File GUID": fileGuid,
    "Version livre livrée": edition,
    "Livraison tentatives": 0,
    "Livraison erreur": reasons.join("; "),
  });
  const saleId = actionId(created);
  await journal(order, ready ? "Completed" : "Manual Review", ready ? `Commande enregistrée; livraison Digify en attente · édition ${edition}` : reasons.join("; "), saleId);
  return NextResponse.json({ ok: true, sale_id: saleId, delivery_status: deliveryStatus, attributed: Boolean(attribution.utm_source || attribution.utm_campaign || attribution.utm_content) });
}
