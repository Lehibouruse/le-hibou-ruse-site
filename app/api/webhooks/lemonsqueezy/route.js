import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createRecord, queryRecords, TABLES, updateRecord } from "../../../../lib/airtable";

export const runtime = "nodejs";

function validSignature(rawBody, signature, secret) {
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const actual = String(signature).trim().toLowerCase();
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

const escapeFormula = (value) => String(value).replaceAll("'", "\\'");

async function journal(event, status, orderId, message) {
  await createRecord(TABLES.journal, {
    Workflow: "Lemon Squeezy → Ventes",
    Déclencheur: event,
    Action: event === "order_refunded" ? "SYNC_REFUND" : "SYNC_SALE",
    Statut: status,
    "Dernière exécution": new Date().toISOString(),
    "ID externe": orderId,
    Erreur: status === "Completed" ? "" : message,
    Notes: message,
  });
}

export async function POST(request) {
  const rawBody = await request.text();
  const event = request.headers.get("x-event-name") || "unknown";
  const signature = request.headers.get("x-signature");
  const secret = process.env.LEMON_SQUEEZY_WEBHOOK_SECRET;

  if (!validSignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!["order_created", "order_refunded"].includes(event)) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const data = payload.data || {};
  const attributes = data.attributes || {};
  const externalId = String(attributes.identifier || data.id || "");
  if (!externalId) return NextResponse.json({ error: "Missing order id" }, { status: 400 });

  try {
    const existing = await queryRecords(TABLES.sales, {
      filterByFormula: `{ID commande externe}='${escapeFormula(externalId)}'`,
      pageSize: 1,
    });
    const item = attributes.first_order_item || {};
    const custom = payload.meta?.custom_data || {};
    const refunded = event === "order_refunded" || Boolean(attributes.refunded_at);
    const fields = {
      Produit: item.product_name || "E-book Le Hibou Rusé",
      Date: attributes.created_at || new Date().toISOString(),
      Montant: Number(attributes.total || 0) / 100,
      Devise: String(attributes.currency || "EUR").toUpperCase(),
      Statut: refunded ? "Remboursée" : (attributes.status_formatted || attributes.status || "Payée"),
      "ID commande externe": externalId,
      Provenance: custom.source || "Lemon Squeezy",
      Campagne: custom.campaign || custom.campaign_id || "",
      Remboursement: refunded ? `Oui — ${attributes.refunded_at || new Date().toISOString()}` : "Non",
      "Email client": attributes.user_email || "",
      Notes: `Lemon Squeezy order ${data.id || externalId}; test_mode=${Boolean(attributes.test_mode)}`,
    };

    if (existing[0]) await updateRecord(TABLES.sales, existing[0].id, fields);
    else await createRecord(TABLES.sales, fields);

    await journal(event, "Completed", externalId, existing[0] ? "Vente mise à jour (idempotente)." : "Vente créée.");
    return NextResponse.json({ ok: true, deduplicated: Boolean(existing[0]) });
  } catch (error) {
    try { await journal(event, "Error", externalId, String(error.message || error)); } catch {}
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 503 });
  }
}
