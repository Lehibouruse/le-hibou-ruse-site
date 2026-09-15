import { adminAuthorized, adminUnauthorized } from "../../../lib/admin-auth.mjs";
import { configMap, getRecords, TABLES } from "../../../lib/airtable";
import { commercialReadiness } from "../../../lib/launch-readiness.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function checkRows(checks = {}) {
  return Object.entries(checks).map(([key, value]) => {
    const ok = value === true || value?.ok === true;
    const detail = typeof value === "object" && value !== null ? (value.detail || value.value || "") : "";
    return `<tr><td><strong>${esc(key)}</strong></td><td class="${ok ? "ok" : "bad"}">${ok ? "OK" : "BLOQUÉ"}</td><td>${esc(detail)}</td></tr>`;
  }).join("");
}

export async function GET(request) {
  if (!adminAuthorized(request)) return adminUnauthorized();

  const [configuration, products, chapters, legal] = await Promise.all([
    getRecords(TABLES.configuration),
    getRecords(TABLES.products),
    getRecords(TABLES.book),
    getRecords(TABLES.legal),
  ]);
  const config = configMap(configuration);
  const product = products.find((record) => record.fields.Actif)?.fields || {};
  const readiness = commercialReadiness({ config, product, chapters, legal });
  const blockers = (readiness.blockers || []).map((item) => `<li>${esc(item)}</li>`).join("");

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Lancement · Le Hibou Rusé</title><style>
    :root{color-scheme:dark}body{margin:0;background:#102d25;color:#f8f0df;font-family:ui-sans-serif,system-ui;padding:40px}main{max-width:1120px;margin:auto}h1{font-family:Georgia,serif;font-size:44px;margin:0 0 8px}.sub{color:#d6c8a7;line-height:1.5;margin-bottom:28px}.hero{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.card{background:#15352d;border:1px solid #2f5146;border-radius:16px;padding:18px}.card span{display:block;color:#adc0b8;font-size:13px}.card strong{display:block;font-size:24px;margin-top:7px}.ok{color:#8ee5aa}.bad{color:#ff9e8f}.warn{color:#eac887}.box{margin-top:28px;background:#15352d;border:1px solid #2f5146;border-radius:16px;padding:20px}.box h2{margin-top:0}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:11px 10px;border-bottom:1px solid #2d4d43;font-size:14px}th{color:#d9b875}ul{line-height:1.65;padding-left:22px}.links{display:flex;gap:10px;flex-wrap:wrap;margin-top:24px}.links a{background:#d5a84c;color:#102d25;text-decoration:none;padding:9px 13px;border-radius:999px;font-weight:700}.foot{color:#adbea9;font-size:13px;margin-top:24px}@media(max-width:760px){body{padding:22px}.hero{grid-template-columns:1fr 1fr}h1{font-size:36px}}
  </style></head><body><main>
    <h1>Prêt au lancement ?</h1><p class="sub">Tableau privé de vérité. Le checkout public reste fermé tant qu’un seul blocage critique subsiste.</p>
    <div class="hero">
      <div class="card"><span>État global</span><strong class="${readiness.ready ? "ok" : "bad"}">${readiness.ready ? "PRÊT" : "BLOQUÉ"}</strong></div>
      <div class="card"><span>Domaine public</span><strong>${esc(readiness.expectedHost || "d4d5d6.com")}</strong></div>
      <div class="card"><span>Livre</span><strong>${Number(readiness.readyBookChapters || 0)}/${Number(readiness.totalBookChapters || 0)}</strong></div>
      <div class="card"><span>Édition</span><strong>${esc(readiness.edition || "—")}</strong></div>
    </div>
    <section class="box"><h2>Contrôles</h2><table><thead><tr><th>Contrôle</th><th>État</th><th>Détail</th></tr></thead><tbody>${checkRows(readiness.checks)}</tbody></table></section>
    <section class="box"><h2>Blocages restants</h2>${blockers ? `<ul>${blockers}</ul>` : '<p class="ok"><strong>Aucun blocage déclaré.</strong></p>'}</section>
    <div class="links"><a href="/admin/social">Connexions sociales</a><a href="/admin/growth">Growth</a></div>
    <p class="foot">Ne pas activer manuellement le commerce pour contourner ce tableau. Le lancement n’est autorisé que lorsque le domaine, Lemon, Digify, le livre et le juridique reflètent leur état réel.</p>
  </main></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
}
