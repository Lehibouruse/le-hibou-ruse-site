import { adminCredentialsAuthorized, derivedCredentialsAuthorized } from "../../lib/admin-auth.mjs";
import { getAllRecords, queryRecords, TABLES } from "../../lib/airtable";
import { chapterContent } from "../../lib/book-renderer.mjs";
import { protectedReaderResponse, readerDeniedResponse, readerSecurityHeaders } from "../../lib/reader-response.mjs";
import { signReaderPreviewToken, verifyReaderPreviewToken } from "../../lib/secure-reader.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const QA_COOKIE = "__Secure-hibou_reader_qa";
const QA_TOKEN_TTL_SECONDS = 6 * 60 * 60;
const PREVIEW_RECOVERY_USER = "hibou";
const PREVIEW_RECOVERY_SALT = "4d91d2a087d7b2c07951fa19f5f986d7";
const PREVIEW_RECOVERY_DIGEST = "100e935bbe8197fe83b677580100107b6ce0d5cc81187c0cdeac9defa5984dcd";

function cookieValue(request, name) {
  const cookies = String(request.headers.get("cookie") || "").split(";");
  for (const cookie of cookies) {
    const separator = cookie.indexOf("=");
    if (separator < 0) continue;
    if (cookie.slice(0, separator).trim() === name) return cookie.slice(separator + 1).trim();
  }
  return "";
}

function loginResponse({ invalid = false, status = 200 } = {}) {
  const error = invalid
    ? '<p class="error" role="alert">Identifiants incorrects. Vérifiez puis réessayez.</p>'
    : "";
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow,noarchive"><title>Aperçu privé du lecteur · Le Hibou Rusé</title><style>
:root{color-scheme:light;--ink:#17382b;--paper:#f7f3e9;--panel:#fffdf7;--line:#d5ccb8;--gold:#9a7a38;--danger:#812f2f}*{box-sizing:border-box}html,body{min-height:100%}body{margin:0;display:grid;place-items:center;padding:24px;background:radial-gradient(circle at top,#fffdf7 0,#f1ecdf 65%,#e4ddcd 100%);color:var(--ink);font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.card{width:min(100%,460px);padding:38px;border:1px solid var(--line);border-radius:18px;background:rgba(255,253,247,.96);box-shadow:0 24px 80px rgba(23,56,43,.12)}.eyebrow{margin:0 0 18px;color:var(--gold);font-size:12px;font-weight:800;letter-spacing:.19em;text-transform:uppercase}h1{margin:0 0 12px;font:700 clamp(32px,8vw,45px)/1.02 Georgia,"Times New Roman",serif;letter-spacing:-.035em}p{margin:0 0 22px;line-height:1.6;color:#4d5c53}.field{display:grid;gap:7px;margin:16px 0}label{font-size:13px;font-weight:750}input{width:100%;min-height:50px;border:1px solid #aaa18e;border-radius:9px;padding:12px 14px;background:#fff;color:#17231d;font:inherit}input:focus{outline:3px solid rgba(154,122,56,.2);border-color:var(--gold)}button{width:100%;min-height:50px;margin-top:10px;border:0;border-radius:9px;background:var(--ink);color:#fffdf7;font:800 14px/1 system-ui;cursor:pointer}button:hover{background:#24513e}.error{margin:0 0 14px;padding:11px 13px;border-left:3px solid var(--danger);background:#f7eaea;color:var(--danger);font-size:13px}.note{margin:19px 0 0;font-size:12px;color:#6a716c}@media(max-width:520px){body{padding:14px}.card{padding:28px 22px;border-radius:14px}}
</style></head><body><main class="card"><p class="eyebrow">Le Hibou Rusé · QA</p><h1>Aperçu privé du lecteur</h1><p>Connectez-vous avec les identifiants réservés à cet aperçu. Une session chiffrée temporaire sera créée sur cet appareil.</p>${error}<form method="post" action="/apercu-lecteur" autocomplete="on"><div class="field"><label for="username">Utilisateur</label><input id="username" name="username" type="text" autocomplete="username" autocapitalize="none" spellcheck="false" required autofocus></div><div class="field"><label for="password">Mot de passe</label><input id="password" name="password" type="password" autocomplete="current-password" required></div><button type="submit">Ouvrir l’aperçu</button></form><p class="note">Aucun achat ni enregistrement de vente ne sera créé.</p></main></body></html>`;
  return new Response(html, {
    status,
    headers: readerSecurityHeaders({
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    }),
  });
}

function sameOrigin(request) {
  const origin = String(request.headers.get("origin") || "").trim();
  if (!origin) return true;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
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
  if (!session) return loginResponse();

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

export async function POST(request) {
  if (!sameOrigin(request)) return loginResponse({ invalid: true, status: 403 });
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 4096) return loginResponse({ invalid: true, status: 413 });

  let form;
  try {
    form = await request.formData();
  } catch {
    return loginResponse({ invalid: true, status: 400 });
  }
  const username = String(form.get("username") || "");
  const password = String(form.get("password") || "");
  const authorized = adminCredentialsAuthorized(username, password, process.env)
    || derivedCredentialsAuthorized(
      username,
      password,
      PREVIEW_RECOVERY_USER,
      PREVIEW_RECOVERY_SALT,
      PREVIEW_RECOVERY_DIGEST,
    );
  if (!authorized) {
    return loginResponse({ invalid: true, status: 401 });
  }
  return issuePreviewSession(request);
}
