import { adminAuthorized } from "../../lib/admin-auth.mjs";
import { getAllRecords, queryRecords, TABLES } from "../../lib/airtable";
import { chapterContent } from "../../lib/book-renderer.mjs";
import { protectedReaderResponse, readerDeniedResponse, readerSecurityHeaders } from "../../lib/reader-response.mjs";
import { signReaderPreviewToken, verifyReaderPreviewToken } from "../../lib/secure-reader.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const QA_COOKIE = "__Secure-hibou_reader_qa";
const QA_TOKEN_TTL_SECONDS = 6 * 60 * 60;

function cookieValue(request, name) {
  const cookies = String(request.headers.get("cookie") || "").split(";");
  for (const cookie of cookies) {
    const separator = cookie.indexOf("=");
    if (separator < 0) continue;
    if (cookie.slice(0, separator).trim() === name) return cookie.slice(separator + 1).trim();
  }
  return "";
}

function adminChallenge() {
  return readerDeniedResponse("Authentification propriétaire requise pour créer un aperçu privé.", 401, {
    "WWW-Authenticate": 'Basic realm="Le Hibou Ruse - apercu lecteur", charset="UTF-8"',
  });
}

function issuePreviewSession(request) {
  let token;
  try {
    token = signReaderPreviewToken({ expiresInSeconds: QA_TOKEN_TTL_SECONDS }, process.env);
  } catch {
    return readerDeniedResponse("L’aperçu privé n’est pas configuré.", 503);
  }
  const location = new URL("/apercu-lecteur", request.url);
  return new Response(null, {
    status: 303,
    headers: readerSecurityHeaders({
      Location: location.toString(),
      "Set-Cookie": `${QA_COOKIE}=${token}; Max-Age=${QA_TOKEN_TTL_SECONDS}; Path=/apercu-lecteur; HttpOnly; Secure; SameSite=Strict; Priority=High`,
    }),
  });
}

export async function GET(request) {
  const token = cookieValue(request, QA_COOKIE);
  const session = verifyReaderPreviewToken(token, process.env);
  if (!session) {
    if (!adminAuthorized(request, process.env)) return adminChallenge();
    return issuePreviewSession(request);
  }

  let chapters;
  let editionRecords;
  try {
    [chapters, editionRecords] = await Promise.all([
      getAllRecords(TABLES.book, { maxRecords: 200 }),
      queryRecords(TABLES.configuration, {
        filterByFormula: "AND({Actif}=1,{Clé}='book_current_edition')",
        pageSize: 1,
      }),
    ]);
  } catch {
    return readerDeniedResponse("Impossible de charger l’aperçu pour le moment.", 503);
  }

  const edition = String(editionRecords[0]?.fields?.Valeur || "").trim();
  if (!edition || edition.toLowerCase().includes("draft")) {
    return readerDeniedResponse("L’édition publiée du guide n’est pas disponible.", 409);
  }
  if (!chapters.some((record) => Boolean(chapterContent(record.fields)))) {
    return readerDeniedResponse("Le guide est temporairement indisponible.", 503);
  }

  return protectedReaderResponse({
    chapters,
    edition,
    generatedAt: new Date().toISOString(),
    watermark: "APERÇU QA PRIVÉ",
  });
}
