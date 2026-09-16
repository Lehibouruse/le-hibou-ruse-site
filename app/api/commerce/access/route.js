import { NextResponse } from "next/server";
import { queryRecords, TABLES } from "../../../../lib/airtable";
import { canonicalSale, escapeFormula, saleIsRefunded } from "../../../../lib/commerce.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function response(body, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Referrer-Policy": "no-referrer",
    },
  });
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

  const safe = escapeFormula(`identifier=${orderIdentifier}`);
  const matches = await queryRecords(TABLES.sales, {
    filterByFormula: `FIND('${safe}',{Notes})`,
    pageSize: 10,
  });
  const sale = canonicalSale(matches);

  // Do not reveal whether an arbitrary identifier exists. A legitimate checkout
  // can simply keep polling while the signed Lemon webhook is still propagating.
  if (!sale) return response({ ok: true, status: "processing" }, 202);

  if (saleIsRefunded(sale.fields)) {
    return response({ ok: true, status: "revoked", reason: "refunded" });
  }

  const deliveryStatus = String(sale.fields?.["Livraison statut"] || "pending").trim().toLowerCase();
  const edition = String(sale.fields?.["Version livre livrée"] || "").trim();

  if (deliveryStatus === "delivered") {
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
