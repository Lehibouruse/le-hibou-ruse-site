import { NextResponse } from "next/server";
import { queryRecords, TABLES } from "../../../../lib/airtable";
import { canonicalSale, escapeFormula, saleIsRefunded } from "../../../../lib/commerce.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEMON_MY_ORDERS_URL = "https://app.lemonsqueezy.com/my-orders";

function response(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
    },
  });
}

function saleDeliveryProvider(fields = {}) {
  const notes = String(fields?.Notes || "");
  if (notes.includes("delivery_provider=lemon_native")) return "lemon_native";
  if (notes.includes("delivery_provider=digify")) return "digify";
  return String(fields?.["Digify File GUID"] || "").trim() ? "digify" : "";
}

function safeAccessUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:") return "";
    if (host !== "digify.com" && !host.endsWith(".digify.com")) return "";
    return url.toString();
  } catch {
    return "";
  }
}

export async function GET(request) {
  const orderIdentifier = String(new URL(request.url).searchParams.get("order") || "").trim();
  if (!UUID_RE.test(orderIdentifier)) {
    return response({ ok: false, status: "invalid_order" }, 400);
  }

  const safeIdentifier = escapeFormula(orderIdentifier);
  const safeLegacyMarker = escapeFormula(`identifier=${orderIdentifier}`);
  const matches = await queryRecords(TABLES.sales, {
    filterByFormula: `OR({Identifiant commande public}='${safeIdentifier}',FIND('${safeLegacyMarker}',{Notes}))`,
    pageSize: 10,
  });

  // Do not reveal whether an arbitrary identifier exists. A legitimate checkout
  // can simply keep polling while the signed Lemon webhook is still propagating.
  if (!matches.length) return response({ ok: true, status: "processing" }, 202);

  // Refund always wins across duplicate/racing records. Never expose an access URL
  // if any record for the public order identifier says the purchase was refunded.
  if (matches.some((record) => saleIsRefunded(record.fields))) {
    return response({ ok: true, status: "revoked", reason: "refunded" });
  }

  // Delivery already has a canonical duplicate guard. The public read path must be
  // at least as strict: ambiguity is manual review, never "pick one and serve".
  if (matches.length !== 1) {
    return response({ ok: true, status: "manual_review" });
  }

  const sale = canonicalSale(matches);
  if (!sale) return response({ ok: true, status: "processing" }, 202);

  const deliveryStatus = String(sale.fields?.["Livraison statut"] || "pending").trim().toLowerCase();
  const edition = String(sale.fields?.["Version livre livrée"] || "").trim();

  if (deliveryStatus === "delivered") {
    const deliveryProvider = saleDeliveryProvider(sale.fields);
    if (deliveryProvider === "lemon_native") {
      return response({
        ok: true,
        status: "delivered_native",
        edition,
        access_url: LEMON_MY_ORDERS_URL,
      });
    }
    const accessUrl = safeAccessUrl(sale.fields?.["Digify access URL"]);
    return response({
      ok: true,
      status: accessUrl ? "delivered" : "delivered_by_email",
      edition,
      ...(accessUrl ? { access_url: accessUrl } : {}),
    });
  }

  if (["revoked", "revocation_pending"].includes(deliveryStatus)) {
    return response({ ok: true, status: "revoked" });
  }
  if (["manual_review", "failed"].includes(deliveryStatus)) {
    return response({ ok: true, status: "manual_review" });
  }

  return response({ ok: true, status: "processing", edition }, 202);
}
