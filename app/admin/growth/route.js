import { adminAuthorized, adminUnauthorized } from "../../../lib/admin-auth.mjs";
import { getRecords, TABLES } from "../../../lib/airtable";
import { growthSummary } from "../../../lib/growth-summary.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function money(value) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(value || 0));
}

function table(title, rows) {
  const body = rows.slice(0, 25).map((row, index) => `<tr><td>${index + 1}</td><td><strong>${esc(row.key)}</strong></td><td>${row.orders}</td><td>${row.refunds}</td><td>${money(row.revenue)}</td></tr>`).join("");
  return `<section><h2>${esc(title)}</h2><div class="table-wrap"><table><thead><tr><th>#</th><th>Clé</th><th>Ventes</th><th>Remb.</th><th>CA attribué</th></tr></thead><tbody>${body || '<tr><td colspan="5">Aucune vente attribuée.</td></tr>'}</tbody></table></div></section>`;
}

export async function GET(request) {
  if (!adminAuthorized(request)) return adminUnauthorized();
  const sales = await getRecords(TABLES.sales, { pageSize: 1000 });
  const summary = growthSummary(sales);
  const rate = `${Math.round(summary.attribution_rate * 1000) / 10}%`;

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Growth · Le Hibou Rusé</title><style>
    :root{color-scheme:dark}body{margin:0;background:#102d25;color:#f8f0df;font-family:ui-sans-serif,system-ui;padding:40px}main{max-width:1240px;margin:auto}h1{font-family:Georgia,serif;font-size:44px;margin:0 0 8px}.sub{color:#d6c8a7;margin-bottom:28px}.cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:28px}.card{background:#15352d;border:1px solid #2f5146;border-radius:16px;padding:18px}.card span{display:block;color:#adc0b8;font-size:13px;margin-bottom:6px}.card strong{font-size:28px}section{margin-top:32px}.table-wrap{overflow:auto;border-radius:16px}table{width:100%;border-collapse:collapse;background:#15352d}th,td{text-align:left;padding:12px 14px;border-bottom:1px solid #2d4d43}th{color:#d9b875}.note{margin-top:30px;color:#adbea9;line-height:1.55}.warn{color:#eac887}@media(max-width:800px){body{padding:22px}.cards{grid-template-columns:1fr 1fr}h1{font-size:36px}}</style></head><body><main>
    <h1>Growth du Hibou</h1><p class="sub">Ce qui compte : portée → rétention → clic → achat. Ce tableau classe pour l’instant le dernier maillon : les ventes et le revenu réellement attribués.</p>
    <div class="cards"><div class="card"><span>Ventes payées</span><strong>${summary.paid_orders}</strong></div><div class="card"><span>CA brut</span><strong>${money(summary.gross_revenue)}</strong></div><div class="card"><span>Taux d’attribution</span><strong>${rate}</strong></div><div class="card"><span>Remboursements</span><strong>${summary.refunds}</strong></div></div>
    ${table("Réseaux / sources", summary.by_source)}
    ${table("Campagnes", summary.by_campaign)}
    ${table("Vidéos / hooks / créations", summary.by_content)}
    <p class="note"><span class="warn">Étape suivante après OAuth social :</span> enrichir ce tableau avec vues, watch time/rétention, clics et engagement via les APIs officielles. On pourra alors calculer vues → clics → ventes et amplifier automatiquement les créations qui génèrent le plus de revenu, pas seulement celles qui font le plus de likes.</p>
  </main></body></html>`;

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
}
