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
  const securityStyles = `
<style id="hibou-reader-security">
html{scroll-behavior:smooth;touch-action:pan-x pan-y pinch-zoom}
html,body,.book,.book *{-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important}
body{padding-bottom:48px}
img{-webkit-user-drag:none!important}
.hibou-reader-tools{position:sticky;top:0;z-index:2147483647;display:flex;align-items:center;justify-content:space-between;gap:16px;min-height:58px;padding:9px max(14px,calc((100vw - 820px)/2));border-bottom:1px solid rgba(23,56,43,.16);background:rgba(255,253,247,.96);backdrop-filter:blur(12px);font-family:ui-sans-serif,system-ui;color:#17382b}
.hibou-reader-identity{min-width:0;font-size:11px;line-height:1.35;color:#59665f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hibou-reader-identity strong{display:block;color:#17382b;font-size:12px}
.hibou-reader-controls{display:flex;align-items:center;gap:6px;flex:0 0 auto}.hibou-reader-controls button{display:grid;place-items:center;min-width:42px;height:38px;padding:0 11px;border:1px solid #c9c0ae;border-radius:9px;background:#fffdf7;color:#17382b;font:800 14px/1 ui-sans-serif,system-ui;cursor:pointer}.hibou-reader-controls button:hover{border-color:#9a7a38;background:#f4eee0}.hibou-reader-controls button:focus-visible{outline:3px solid rgba(154,122,56,.32);outline-offset:2px}.hibou-reader-controls button:disabled{opacity:.4;cursor:not-allowed}.hibou-reader-size{min-width:62px;font-variant-numeric:tabular-nums}
.hibou-reader-progress{position:absolute;left:0;bottom:-1px;width:0;height:3px;background:#9a7a38;transition:width .12s linear}
.hibou-reader-status{position:fixed;z-index:2147483646;left:50%;bottom:9px;transform:translateX(-50%);max-width:min(92vw,720px);padding:7px 13px;border:1px solid rgba(23,56,43,.14);border-radius:999px;background:rgba(255,253,247,.96);box-shadow:0 5px 22px rgba(20,34,28,.12);color:#46534c;font:700 11px/1.2 ui-sans-serif,system-ui;letter-spacing:.015em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-variant-numeric:tabular-nums}
@media(max-width:560px){.hibou-reader-tools{min-height:54px;padding:8px 10px}.hibou-reader-identity span{display:none}.hibou-reader-controls button{min-width:38px;height:36px;padding:0 8px}.hibou-reader-size{min-width:58px}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}.hibou-reader-progress{transition:none}}
@media print{html,body,body *{visibility:hidden!important;display:none!important}}
</style>`;
  const toolbar = `
<aside class="hibou-reader-tools" aria-label="Outils de confort de lecture">
  <div class="hibou-reader-identity"><strong>${mark}</strong><span>Consultation personnelle, copie et impression désactivées</span></div>
  <div class="hibou-reader-controls" role="group" aria-label="Taille du texte">
    <button type="button" data-reader-size="down" aria-label="Réduire la taille du texte">A−</button>
    <button type="button" class="hibou-reader-size" data-reader-size="reset" aria-label="Rétablir la taille normale"><span aria-live="polite">100 %</span></button>
    <button type="button" data-reader-size="up" aria-label="Agrandir la taille du texte">A+</button>
  </div>
  <div class="hibou-reader-progress" aria-hidden="true"></div>
</aside>
<div class="hibou-reader-status" aria-live="polite">Page 1 / 1</div>`;
  const securityScript = `
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
  const sizes = [16, 17.5, 19.5, 22];
  const root = document.documentElement;
  const label = document.querySelector(".hibou-reader-size span");
  const down = document.querySelector('[data-reader-size="down"]');
  const reset = document.querySelector('[data-reader-size="reset"]');
  const up = document.querySelector('[data-reader-size="up"]');
  let index = 1;
  try {
    const saved = Number(sessionStorage.getItem("hibou-reader-size"));
    if (Number.isInteger(saved) && saved >= 0 && saved < sizes.length) index = saved;
  } catch {}
  const applySize = () => {
    root.style.setProperty("--reader-font-size", sizes[index] + "px");
    if (label) label.textContent = Math.round((sizes[index] / sizes[1]) * 100) + " %";
    if (down) down.disabled = index === 0;
    if (up) up.disabled = index === sizes.length - 1;
    try { sessionStorage.setItem("hibou-reader-size", String(index)); } catch {}
  };
  down?.addEventListener("click", () => { index = Math.max(0, index - 1); applySize(); });
  reset?.addEventListener("click", () => { index = 1; applySize(); });
  up?.addEventListener("click", () => { index = Math.min(sizes.length - 1, index + 1); applySize(); });
  applySize();
  const progress = document.querySelector(".hibou-reader-progress");
  const status = document.querySelector(".hibou-reader-status");
  const landmarks = [...document.querySelectorAll(".cover h1, .frontmatter h2, .chapter > h1, .chapter-body > h3")];
  const currentLandmark = () => {
    const threshold = 180;
    let current = landmarks[0];
    for (const landmark of landmarks) {
      if (landmark.getBoundingClientRect().top <= threshold) current = landmark;
      else break;
    }
    return String(current?.textContent || "").trim();
  };
  const updateReadingState = () => {
    const distance = document.documentElement.scrollHeight - window.innerHeight;
    const percent = distance > 0 ? Math.min(100, Math.max(0, (window.scrollY / distance) * 100)) : 0;
    if (progress) progress.style.width = percent + "%";
    const pageHeight = Math.max(1, window.innerHeight);
    const totalPages = Math.max(1, Math.ceil(document.documentElement.scrollHeight / pageHeight));
    const currentPage = Math.min(totalPages, Math.max(1, Math.floor(window.scrollY / pageHeight) + 1));
    const context = currentLandmark();
    if (status) status.textContent = "Page " + currentPage + " / " + totalPages + (context ? " · " + context : "");
  };
  const scheduleReadingState = () => requestAnimationFrame(() => requestAnimationFrame(updateReadingState));
  down?.addEventListener("click", scheduleReadingState);
  reset?.addEventListener("click", scheduleReadingState);
  up?.addEventListener("click", scheduleReadingState);
  document.addEventListener("scroll", updateReadingState, { passive: true });
  window.addEventListener("resize", updateReadingState, { passive: true });
  window.addEventListener("hashchange", scheduleReadingState);
  window.addEventListener("load", updateReadingState, { once: true });
  updateReadingState();
})();
</script>`;
  return html
    .replace("</head>", `${securityStyles}</head>`)
    .replace("<body>", `<body>${toolbar}`)
    .replace("</body>", `${securityScript}</body>`);
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
