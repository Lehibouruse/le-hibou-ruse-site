import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createRecord, getRecord, queryRecords, TABLES, updateRecord } from "../../../../lib/airtable";
import { revokeDigifyRecipient } from "../../../../lib/commerce.mjs";
import { clearCommerceLease, commerceClaimPatch, commercePendingFormula, commerceStaleFormula, ownsCommerceLease } from "../../../../lib/commerce-lease.mjs";
import { verifyGithubActionsToken } from "../../../../lib/github-oidc.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const OIDC_WORKFLOW = "hibou-wake.yml";
const ALLOWED_EVENTS = ["schedule", "workflow_dispatch"];

async function journal(sale, status, note) {
  await createRecord(TABLES.journal, {
    Workflow: "HIBOU_DIGIFY_REVOCATION_V2",
    Déclencheur: "Ventes remboursées",
    Action: `REVOKE_EBOOK · ${sale.fields?.["ID commande externe"] || sale.id}`,
    Statut: status,
    "Dernière exécution": new Date().toISOString(),
    "ID externe": sale.id,
    Erreur: status === "Error" || status === "Manual Review" ? String(note).slice(0, 5000) : "",
    Notes: String(note).slice(0, 10000),
  }).catch(() => {});
}

async function clearStaleRevocation() {
  const stale = await queryRecords(TABLES.sales, { filterByFormula: commerceStaleFormula("revocation"), pageSize: 1 });
  const sale = stale[0];
  if (!sale) return null;
  const reason = "Révocation Digify interrompue après prise de bail : état externe ambigu. Vérifier l'accès avant nouvelle tentative.";
  await updateRecord(TABLES.sales, sale.id, clearCommerceLease({ "Livraison statut": "manual_review", "Livraison erreur": reason }));
  await journal(sale, "Manual Review", reason);
  return sale.id;
}

export async function POST(request) {
  try {
    const auth = request.headers.get("authorization") || "";
    if (!auth.startsWith("Bearer ")) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    await verifyGithubActionsToken(auth.slice("Bearer ".length), {
      allowedWorkflowFiles: [OIDC_WORKFLOW],
      allowedEvents: ALLOWED_EVENTS,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error?.message || "Unauthorized").slice(0, 300) }, { status: 401 });
  }

  const configured = Boolean(process.env.DIGIFY_KEY_ID && process.env.DIGIFY_SECRET);
  if (!configured) return NextResponse.json({ ok: true, processed: 0, reason: "revocation_not_configured", configured: false });

  const staleId = await clearStaleRevocation();
  if (staleId) return NextResponse.json({ ok: true, processed: 1, status: "manual_review", reason: "stale_revocation_ambiguous", sale_id: staleId });

  const pending = await queryRecords(TABLES.sales, { filterByFormula: commercePendingFormula("revocation"), pageSize: 1 });
  const sale = pending[0];
  if (!sale) return NextResponse.json({ ok: true, processed: 0, reason: "no_pending_revocation", configured: true });

  const attempts = Number(sale.fields?.["Révocation tentatives"] || 0) + 1;
  if (attempts > 3) {
    await updateRecord(TABLES.sales, sale.id, clearCommerceLease({ "Livraison statut": "manual_review", "Livraison erreur": "Plus de 3 tentatives de révocation Digify." }));
    await journal(sale, "Manual Review", "Plus de 3 tentatives de révocation Digify.");
    return NextResponse.json({ ok: true, processed: 1, status: "manual_review" });
  }

  const fileGuid = String(sale.fields?.["Digify File GUID"] || "").trim();
  const email = String(sale.fields?.["Digify recipient email"] || sale.fields?.["Email client"] || "").trim().toLowerCase();
  const orderId = String(sale.fields?.["ID commande externe"] || "").trim();
  if (!fileGuid || !email || !orderId) {
    const reason = !fileGuid ? "Digify File GUID absent" : !email ? "Email destinataire absent" : "ID commande externe absent";
    await updateRecord(TABLES.sales, sale.id, clearCommerceLease({ "Livraison statut": "manual_review", "Livraison erreur": reason, "Révocation tentatives": attempts }));
    await journal(sale, "Manual Review", reason);
    return NextResponse.json({ ok: true, processed: 1, status: "manual_review", reason });
  }

  const token = randomUUID();
  await updateRecord(TABLES.sales, sale.id, commerceClaimPatch({ token, status: "revoking", attempts }));
  const current = await getRecord(TABLES.sales, sale.id);
  if (!ownsCommerceLease(current, token, "revoking")) {
    return NextResponse.json({ ok: true, processed: 0, reason: "revocation_claim_lost" });
  }

  try {
    await revokeDigifyRecipient({ fileGuid, email, orderId });
    await updateRecord(TABLES.sales, sale.id, clearCommerceLease({ "Livraison statut": "revoked", "Révoqué le": new Date().toISOString(), "Livraison erreur": "" }));
    await journal(current, "Completed", "Destinataire Digify retiré après remboursement (suppression API officielle; analytics destinataire supprimés côté Digify)");
    return NextResponse.json({ ok: true, processed: 1, status: "revoked" });
  } catch (error) {
    const retryable = error?.retryable === true && attempts < 3;
    const message = String(error?.message || error).slice(0, 5000);
    await updateRecord(TABLES.sales, sale.id, clearCommerceLease({ "Livraison statut": retryable ? "revocation_pending" : "manual_review", "Livraison erreur": message }));
    await journal(current, retryable ? "Retry" : "Manual Review", message);
    return NextResponse.json({ ok: retryable, processed: 1, status: retryable ? "retry" : "manual_review", error: message }, { status: retryable ? 200 : 422 });
  }
}
