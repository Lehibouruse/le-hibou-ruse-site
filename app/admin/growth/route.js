import { adminAuthorized, adminUnauthorized } from "../../../lib/admin-auth.mjs";
import { getAllRecords, TABLES } from "../../../lib/airtable";
import { funnelSummary } from "../../../lib/growth-summary.mjs";

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
  const body = rows.slice(0, 30).map((row, index) => `<tr>
    <td>${index + 1}</td><td><strong>${esc(row.key)}</strong></td>
    <td>${row.visitors}</td><td>${row.checkout_sessions}</td><td>${row.purchases}</td>
    <td>${pct(row.visitor_to_checkout)}</td><td>${pct(row.visitor_to_purchase)}</td>
    <td>${money(row.net_revenue)}</td><td>${money(row.revenue_per_visitor)}</td><td>${pct(row.refund_rate)}</td>
  </tr>`).join("");
  return `<section><h2>${esc(title)}</h2><div class="table-wrap"><table><thead><tr><th>#</th><th>Clé</th><th>Visiteurs</th><th>Checkout</th><th>Achats</th><th>Visite→checkout</th><th>Visite→achat</th><th>CA net</th><th>€/visiteur</th><th>Remb.</th></tr></thead><tbody>${body || '<tr><td colspan="10">Aucune donnée attribuée.</td></tr>'}</tbody></table></div></section>`;
}

export async function GET(request) {
  if (!adminAuthorized(request)) return adminUnauthorized();
  const [sales, events] = await Promise.all([
    getAllRecords(TABLES.sales, { maxRecords: 3000 }),
    getAllRecords(TABLES.conversionEvents, { maxRecords: 5000 }),
  ]);
  const summary = funnelSummary(sales, events);

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Growth · Le Hibou Rusé</title><style>
    :root{color-scheme:dark}body{margin:0;background:#102d25;color:#f8f0df;font-family:ui-sans-serif,system-ui;padding:40px}main{max-width:1480px;margin:auto}h1{font-family:Georgia,serif;font-size:44px;margin:0 0 8px}.sub{color:#d6c8a7;margin-bottom:28px;max-width:900px;line-height:1.5}.cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:12px}.card{background:#15352d;border:1px solid #2f5146;border-radius:16px;padding:18px}.card span{display:block;color:#adc0b8;font-size:13px;margin-bottom:6px}.card strong{font-size:28px}.card small{display:block;color:#8ea69d;margin-top:5px}section{margin-top:36px}.table-wrap{overflow:auto;border-radius:16px;border:1px solid #294b40}table{width:100%;min-width:1120px;border-collapse:collapse;background:#15352d}th,td{text-align:left;padding:12px 13px;border-bottom:1px solid #2d4d43;font-size:13px}th{color:#d9b875;white-space:nowrap}.note{margin-top:30px;color:#adbea9;line-height:1.55}.warn{color:#eac887}@media(max-width:800px){body{padding:22px}.cards{grid-template-columns:1fr 1fr}h1{font-size:36px}}</style></head><body><main>
    <h1>Growth du Hibou</h1><p class="sub">La métrique finale est l’achat. Les likes ne sont qu’un signal intermédiaire. Le tableau relie maintenant la visite attribuée, le clic checkout, l’achat, le remboursement et le revenu net. Après OAuth social, on ajoutera impressions, vues et rétention pour obtenir la chaîne complète portée → rétention → clic → achat.</p>
    <div class="cards">
      <div class="card"><span>Visiteurs attribués</span><strong>${summary.attributed_visitors}</strong><small>sessions first-party</small></div>
      <div class="card"><span>Visite → checkout</span><strong>${pct(summary.visitor_to_checkout)}</strong><small>${summary.attributed_checkout_sessions} sessions checkout</small></div>
      <div class="card"><span>Visite → achat</span><strong>${pct(summary.visitor_to_purchase)}</strong><small>${summary.attributed_purchases}/${summary.purchases} achats attribués</small></div>
      <div class="card"><span>CA net</span><strong>${money(summary.net_revenue)}</strong><small>${money(summary.revenue_per_attributed_visitor)} / visiteur attribué</small></div>
    </div>
    <div class="cards">
      <div class="card"><span>Achats</span><strong>${summary.purchases}</strong><small>avant effet des remboursements</small></div>
      <div class="card"><span>Checkout → achat</span><strong>${pct(summary.checkout_to_purchase)}</strong><small>sur trafic attribué</small></div>
      <div class="card"><span>Remboursements</span><strong>${summary.refunds}</strong><small>${pct(summary.refund_rate)} des achats</small></div>
      <div class="card"><span>Attribution achats</span><strong>${pct(summary.purchase_attribution_rate)}</strong><small>objectif : tendre vers 100 %</small></div>
    </div>
    ${table("Réseaux / sources", summary.by_source)}
    ${table("Campagnes", summary.by_campaign)}
    ${table("Vidéos / hooks / créations", summary.by_content)}
    <p class="note"><span class="warn">Règle d’arbitrage :</span> privilégier les créations qui combinent volume suffisant, bon taux visite→achat et revenu/visiteur élevé. Une vidéo virale qui ne fait pas acheter ne doit pas automatiquement devenir le modèle éditorial.</p>
  </main></body></html>`;

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
}
