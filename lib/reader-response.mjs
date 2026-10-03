import { renderBookDocument } from "./book-renderer.mjs";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function readerSecurityHeaders(extra = {}) {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store, private, max-age=0",
    Pragma: "no-cache",
    "X-Robots-Tag": "noindex, nofollow, noarchive, nosnippet",
    "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Permissions-Policy": "clipboard-read=(), clipboard-write=()",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    ...extra,
  };
}

export function readerDeniedResponse(message = "Accès lecteur invalide", status = 403, extraHeaders = {}) {
  return new Response(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow,noarchive"><title>Accès au guide</title></head><body><main style="max-width:680px;margin:80px auto;padding:24px;font-family:system-ui"><h1>Accès au guide</h1><p>${escapeHtml(message)}</p><p><a href="/">Retour au site</a></p></main></body></html>`, {
    status,
    headers: readerSecurityHeaders(extraHeaders),
  });
}

export function protectReaderHtml(html, { watermark = "Accès nominatif", edition = "" } = {}) {
  const mark = escapeHtml(watermark || "Accès nominatif");
  const safeEdition = escapeHtml(edition);
  const repeatedWatermark = Array.from({ length: 9 }, (_, index) =>
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
<div class="hibou-reader-watermark" aria-hidden="true">${repeatedWatermark}</div>
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

export function protectedReaderResponse({
  chapters,
  edition,
  watermark,
  generatedAt = new Date().toISOString(),
  updatedSincePurchase = false,
}) {
  const html = renderBookDocument({
    chapters,
    edition,
    generatedAt,
    publishedReader: true,
    updatedSincePurchase,
  });
  return new Response(protectReaderHtml(html, { watermark, edition }), {
    status: 200,
    headers: readerSecurityHeaders({ "Content-Disposition": "inline" }),
  });
}
