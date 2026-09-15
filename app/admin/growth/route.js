import { adminAuthorized, adminUnauthorized } from "../../../lib/admin-auth.mjs";
import { getAllRecords, TABLES } from "../../../lib/airtable";
import { contentFunnel, conversionSummary, growthSummary, socialPerformanceSummary } from "../../../lib/growth-summary.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function money(value) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(Number(value || 0));
}

function pct(value) {
  return `${Math.round(Number(value || 0) * 1000) / 10}%`;
}

function table(title, rows) {
  const body = rows.slice(0, 25).map((row, index) => `<tr><td>${index + 1}</td><td><strong>${esc(row.key)}</strong></td><td>${row.orders}</td><td>${row.refunds}</td><td>${money(row.revenue)}</td></tr>`).join("");
  return `<section><h2>${esc(title)}</h2><div class="table-wrap"><table><thead><tr><th>#</th><th>Clé</th><th>Ventes</th><th>Remb.</th><th>CA attribué</th></tr></thead><tbody>${body || '<tr><td colspan="5">Aucune vente attribuée.</td></tr>'}</tbody></table></div></section>`;
}

function funnelTable(rows) {
  const body = rows.slice(0, 30).map((row, index) => `<tr><td>${index + 1}</td><td><strong>${esc(row.key)}</strong></td><td>${row.views}</td><td>${row.landings}</td><td>${row.checkout_clicks}</td><td>${row.orders}</td><td>${pct(row.visit_to_purchase_rate)}</td><td>${money(row.revenue)}</td><td>${money(row.revenue_per_1000_views)}</td></tr>`).join("");
  return `<section><h2>Créations : portée → achat</h2><div class="table-wrap"><table><thead><tr><th>#</th><th>Création</th><th>Vues</th><th>Visites</th><th>Checkout</th><th>Ventes</th><th>Visite→achat</th><th>CA</th><th>CA / 1k vues</th></tr></thead><tbody>${body || '<tr><td colspan="9">Les lignes apparaîtront dès que les contenus traçables génèrent des événements ou des ventes.</td></tr>'}</tbody></table></div></section>`;
}

function providerTable(rows) {
  const body = rows.map((row) => `<tr><td><strong>${esc(row.provider)}</strong></td><td>${row.views}</td><td>${row.clicks}</td><td>${row.likes}</td><td>${row.comments}</td><td>${row.shares}</td><td>${Math.round(row.watch_time_seconds)}</td></tr>`).join("");
  return `<section><h2>Performance sociale par réseau</h2><div class="table-wrap"><table><thead><tr><th>Réseau</th><th>Vues</th><th>Clics</th><th>Likes</th><th>Commentaires</th><th>Partages</th><th>Watch time s</th></tr></thead><tbody>${body || '<tr><td colspan="7">En attente des connexions OAuth et des premiers snapshots API.</td></tr>'}</tbody></table></div></section>`;
}

export async function GET(request) {
  if (!adminAuthorized(request)) return adminUnauthorized();
  const [sales, events, performance] = await Promise.all([
    getAllRecords(TABLES.sales, { maxRecords: 3000 }),
    getAllRecords(TABLES.conversionEvents, { maxRecords: 5000 }),
    getAllRecords(TABLES.socialPerformance, { maxRecords: 5000 }),
  ]);
  const summary = growthSummary(sales);
  const conversion = conversionSummary(events);
  const social = socialPerformanceSummary(performance);
  const funnel = contentFunnel(sales, events, performance);

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Growth · Le Hibou Rusé</title><style>
    :root{color-scheme:dark}body{margin:0;background:#102d25;color:#f8f0df;font-family:ui-sans-serif,system-ui;padding:40px}main{max-width:1320px;margin:auto}h1{font-family:Georgia,serif;font-size:44px;margin:0 0 8px}.sub{color:#d6c8a7;margin-bottom:28px}.cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:14px}.card{background:#15352d;border:1px solid #2f5146;border-radius:16px;padding:18px}.card span{display:block;color:#adc0b8;font-size:13px;margin-bottom:6px}.card strong{font-size:27px}section{margin-top:32px}.table-wrap{overflow:auto;border-radius:16px}table{width:100%;border-collapse:collapse;background:#15352d}th,td{text-align:left;padding:12px 14px;border-bottom:1px solid #2d4d43;white-space:nowrap}th{color:#d9b875}.note{margin-top:30px;color:#adbea9;line-height:1.55}.warn{color:#eac887}@media(max-width:800px){body{padding:22px}.cards{grid-template-columns:1fr 1fr}h1{font-size:36px}}</style></head><body><main>
    <h1>Growth du Hibou</h1><p class="sub">Objectif permanent : portée → rétention → clic → achat. Les créations doivent être jugées sur le revenu qu’elles produisent, pas seulement sur l’engagement.</p>
    <div class="cards"><div class="card"><span>Ventes payées</span><strong>${summary.paid_orders}</strong></div><div class="card"><span>CA brut</span><strong>${money(summary.gross_revenue)}</strong></div><div class="card"><span>Ventes attribuées</span><strong>${pct(summary.attribution_rate)}</strong></div><div class="card"><span>Remboursements</span><strong>${summary.refunds}</strong></div></div>
    <div class="cards"><div class="card"><span>Sessions site</span><strong>${conversion.unique_sessions}</strong></div><div class="card"><span>Clics checkout</span><strong>${conversion.checkout_clicks}</strong></div><div class="card"><span>Visite → checkout</span><strong>${pct(conversion.landing_to_checkout_rate)}</strong></div><div class="card"><span>Vues sociales mesurées</span><strong>${social.views}</strong></div></div>
    ${funnelTable(funnel)}
    ${providerTable(social.by_provider)}
    ${table("Réseaux / sources", summary.by_source)}
    ${table("Campagnes", summary.by_campaign)}
    ${table("Vidéos / hooks / créations", summary.by_content)}
    <p class="note"><span class="warn">Lecture :</span> tant que les comptes sociaux ne sont pas autorisés via OAuth, la partie vues/rétention reste vide. Les visites et clics checkout first-party peuvent en revanche être mesurés dès que le déploiement Vercel de cette version est actif. Aucun pixel publicitaire tiers n’est requis.</p>
  </main></body></html>`;

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
}
