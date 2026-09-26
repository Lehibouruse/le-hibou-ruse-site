import { getAllRecords, getRecord, TABLES } from "../../lib/airtable";
import { renderBookDocument } from "../../lib/book-renderer.mjs";
import { saleIsRefunded } from "../../lib/commerce.mjs";
import { verifyReaderToken } from "../../lib/secure-reader.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function denied(message = "Accès lecteur invalide", status = 403) {
  return new Response(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow,noarchive"><title>Accès au guide</title></head><body><main style="max-width:680px;margin:80px auto;padding:24px;font-family:system-ui"><h1>Accès au guide</h1><p>${escapeHtml(message)}</p><p><a href="/">Retour au site</a></p></main></body></html>`, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store, private, max-age=0",
      "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function protectHtml(html, { email = "", edition = "" } = {}) {
  const mark = escapeHtml(email || "Accès nominatif");
  const safeEdition = escapeHtml(edition);
  const watermark = Array.from({ length: 9 }, (_, index) =>
    `<span style="position:absolute;left:${12 + (index % 3) * 34}%;top:${12 + Math.floor(index / 3) * 34}%;transform:rotate(-28deg);font:700 13px system-ui;letter-spacing:.08em;color:rgba(25,25,25,.13);white-space:nowrap">${mark}${safeEdition ? ` · ${safeEdition}` : ""}</span>`
  ).join("");
  const security = `
<style id="hibou-reader-security">
html,body,.book,.book *{-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important}
img{-webkit-user-drag:none!important}
.hibou-reader-watermark{position:fixed;inset:0;pointer-events:none;z-index:2147483646;overflow:hidden}
.hibou-reader-notice{position:fixed;left:16px;right:16px;bottom:12px;z-index:2147483647;margin:auto;max-width:760px;padding:9px 14px;border:1px solid rgba(0,0,0,.12);border-radius:999px;background:rgba(255,253,247,.93);backdrop-filter:blur(8px);font:600 11px/1.35 system-ui;color:#555;text-align:center}
@media print{html,body,body *{visibility:hidden!important;display:none!important}}
</style>
<div class="hibou-reader-watermark" aria-hidden="true">${watermark}</div>
<div class="hibou-reader-notice">Consultation personnelle — téléchargement, impression et copie désactivés.</div>
<script>
(() => {
  const stop = (event) => { event.preventDefault(); event.stopPropagation(); };
  for (const type of ["copy","cut","contextmenu","dragstart"]) {
    document.addEventListener(type, stop, { capture: true });
  }
  document.addEventListener("selectstart", stop, { capture: true });
  document.addEventListener("keydown", (event) => {
    const key = String(event.key || "").toLowerCase();
    const modified = event.ctrlKey || event.metaKey;
    if (modified && ["c","x","s","p","u","a","f"].includes(key)) stop(event);
    if (event.key === "PrintScreen") stop(event);
  }, { capture: true });
  window.addEventListener("beforeprint", stop, { capture: true });
})();
</script>`;
  return html.replace("</body>", `${security}</body>`);
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
  if (!chapters.length) return denied("Le guide est temporairement indisponible.", 503);

  const html = renderBookDocument({
    chapters,
    edition,
    generatedAt: new Date().toISOString(),
  });
  const secured = protectHtml(html, {
    email: String(fields["Email client"] || "").trim().toLowerCase(),
    edition,
  });

  return new Response(secured, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": "inline",
      "Cache-Control": "no-store, private, max-age=0",
      "Pragma": "no-cache",
      "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
      "Referrer-Policy": "no-referrer",
      "X-Frame-Options": "DENY",
      "X-Content-Type-Options": "nosniff",
      "Permissions-Policy": "clipboard-read=(), clipboard-write=()",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    },
  });
}
