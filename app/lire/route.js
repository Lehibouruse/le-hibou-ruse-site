import { getAllRecords, getRecord, TABLES } from "../../lib/airtable";
import { chapterContent } from "../../lib/book-renderer.mjs";
import { saleIsRefunded } from "../../lib/commerce.mjs";
import { verifyReaderToken } from "../../lib/secure-reader.mjs";
import { bookEditionManifest } from "../../lib/book-edition-manifest.mjs";
import { protectedReaderResponse, readerDeniedResponse } from "../../lib/reader-response.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function denied(message = "Accès lecteur invalide", status = 403) {
  return readerDeniedResponse(message, status);
}

export async function GET(request) {
  const token = String(new URL(request.url).searchParams.get("token") || "").trim();
  const identity = verifyReaderToken(token, process.env);
  if (!identity) return denied("Ce lien de lecture est invalide ou a été modifié.");

  let sale;
  try {
    sale = await getRecord(TABLES.sales, identity.saleId);
  } catch {
    return denied("Impossible de vérifier cet accès pour le moment.", 503);
  }

  const fields = sale?.fields || {};
  const orderIdentifier = String(fields["Identifiant commande public"] || "").trim();
  if (!orderIdentifier || orderIdentifier !== identity.orderIdentifier) {
    return denied("Ce lien ne correspond pas à cette commande.");
  }
  if (saleIsRefunded(fields)) return denied("Cet accès a été révoqué.", 410);

  const deliveryStatus = String(fields["Livraison statut"] || "").trim().toLowerCase();
  if (deliveryStatus !== "reader_ready") {
    return denied("Cet accès n’est pas actif.", 403);
  }

  const edition = String(fields["Version livre livrée"] || identity.edition || "").trim();
  if (!edition || edition.toLowerCase().includes("draft")) {
    return denied("L’édition du guide n’est pas disponible.", 409);
  }

  const chapters = await getAllRecords(TABLES.book, { maxRecords: 200 });
  if (!chapters.some((record) => Boolean(chapterContent(record.fields)))) return denied("Le guide est temporairement indisponible.", 503);
  const originalManifestHash = String(fields.Notes || "").match(/(?:^|; )edition_manifest_sha256=([a-f0-9]{64})/)?.[1] || "";
  const currentManifest = bookEditionManifest(chapters, edition);

  return protectedReaderResponse({
    chapters,
    edition,
    generatedAt: new Date().toISOString(),
    updatedSincePurchase: Boolean(originalManifestHash && currentManifest.sha256 !== originalManifestHash),
    watermark: String(fields["Email client"] || "").trim().toLowerCase() || "Accès nominatif",
  });
}
