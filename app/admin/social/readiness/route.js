import { adminAuthorized, adminUnauthorized } from "../../../../lib/admin-auth.mjs";
import { queryAllRecords, TABLES } from "../../../../lib/airtable.js";
import { socialGatewayStatusWithVault } from "../../../../lib/social-credentials-runtime.mjs";
import { buildSocialRoutingPlan } from "../../../../lib/social-routing-plan.mjs";
import { configurationMap, socialPolicy, socialRuntimeEnv } from "../../../../lib/social-runtime.mjs";
import { buildSocialValidationPlan } from "../../../../lib/social-validation-plan.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}
function yes(value) { return value ? '<span class="ok">Oui</span>' : '<span class="wait">Non</span>'; }
function routeLabel(value) {
  return ({ direct_api: "API directe", webhook_fallback: "Webhook runtime", chatgpt_metricool: "ChatGPT → Metricool", blocked: "Bloqué" })[value] || value;
}
function strategyLabel(value) {
  return ({
    NON_PUBLIC_DIRECT_TEST: "Test non public",
    SANDBOX_OR_TRIAL_TEST: "Sandbox / Trial",
    EXPLICIT_PUBLIC_APPROVAL_REQUIRED: "Accord public explicite",
    EXTERNAL_ACCESS_AND_SPEND_APPROVAL_REQUIRED: "Accès/coût externe",
    EXTERNAL_PRODUCT_APPROVAL_REQUIRED: "Approbation produit externe",
  })[value] || value;
}

export async function GET(request) {
  if (!adminAuthorized(request)) return adminUnauthorized();
  const [accounts, configuration] = await Promise.all([
    queryAllRecords(TABLES.socialAccounts, {}, { maxRecords: 50 }),
    queryAllRecords(TABLES.configuration, {}, { maxRecords: 250 }),
  ]);
  const config = configurationMap(configuration);
  const policy = socialPolicy(config);
  const env = socialRuntimeEnv(config, process.env);
  const gateways = await socialGatewayStatusWithVault(env);
  const publish = buildSocialRoutingPlan({ operation: "publish", accounts, gateways, policy });
  const read = buildSocialRoutingPlan({ operation: "read", accounts, gateways, policy });
  const analytics = buildSocialRoutingPlan({ operation: "analytics", accounts, gateways, policy });
  const validation = buildSocialValidationPlan({ accounts, gateways, config });
  const byProvider = (plan) => new Map(plan.routes.map((item) => [item.provider, item]));
  const publishMap = byProvider(publish);
  const readMap = byProvider(read);
  const analyticsMap = byProvider(analytics);
  const validationMap = new Map(validation.plans.map((item) => [item.provider, item]));

  const rows = publish.routes.map((pub) => {
    const r = readMap.get(pub.provider) || {};
    const a = analyticsMap.get(pub.provider) || {};
    const v = validationMap.get(pub.provider) || {};
    const blocker = pub.ready ? "" : pub.blocker;
    return `<tr>
      <td><strong>${esc(pub.platform)}</strong><small>${esc(pub.provider)}</small></td>
      <td>${esc(routeLabel(r.route))}</td>
      <td>${esc(routeLabel(pub.route))}</td>
      <td>${esc(routeLabel(a.route))}</td>
      <td>${yes(pub.oauth_connected)}</td>
      <td>${yes(pub.read_tested)}</td>
      <td>${yes(pub.publish_tested)}</td>
      <td>${yes(pub.analytics_tested)}</td>
      <td><strong>${esc(strategyLabel(v.strategy))}</strong><small>${esc(v.enforced_visibility || "")}</small></td>
      <td>${yes(v.executable_nonpublic_test)}</td>
      <td><div>${esc(blocker || v.reason || "Prêt")}</div><small>${esc(pub.next_human_action || v.next_human_action || "")}</small></td>
    </tr>`;
  }).join("");

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Social readiness · Le Hibou Rusé</title><style>
    :root{color-scheme:dark}body{margin:0;background:#102d25;color:#f8f0df;font-family:ui-sans-serif,system-ui;padding:36px}main{max-width:1600px;margin:auto}h1{font-family:Georgia,serif;font-size:42px;margin:0 0 8px}.sub,.foot{color:#b7c6c0;line-height:1.55}.cards{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:24px 0}.card{background:#15352d;border:1px solid #2f5146;border-radius:15px;padding:15px}.card span{display:block;color:#adc0b8;font-size:12px}.card strong{font-size:25px}.table-wrap{overflow:auto;border:1px solid #294b40;border-radius:16px}table{width:100%;min-width:1550px;border-collapse:collapse;background:#15352d}th,td{text-align:left;padding:11px 12px;border-bottom:1px solid #2d4d43;vertical-align:top;font-size:13px}th{color:#d9b875;white-space:nowrap}td small{display:block;color:#8fa59d;margin-top:5px;max-width:360px}.ok{color:#8ee5aa}.wait{color:#eac887}a{color:#e8ca89}.foot{margin-top:22px}@media(max-width:900px){body{padding:20px}.cards{grid-template-columns:1fr 1fr}}</style></head><body><main>
    <h1>Social readiness</h1>
    <p class="sub">Vue machine de la meilleure voie disponible aujourd’hui. API directe prioritaire, webhook runtime ensuite, puis Metricool depuis ChatGPT. Aucun statut de lecture n’est assimilé à une validation de publication.</p>
    <div class="cards">
      <div class="card"><span>Publication : voies prêtes</span><strong>${publish.summary.ready}/${publish.summary.total}</strong></div>
      <div class="card"><span>API directe publication</span><strong>${publish.summary.direct}</strong></div>
      <div class="card"><span>ChatGPT → Metricool</span><strong>${publish.summary.metricool}</strong></div>
      <div class="card"><span>Tests non publics prêts</span><strong>${validation.summary.nonpublic_test_ready}</strong></div>
      <div class="card"><span>OAuth humain prêt</span><strong>${publish.summary.human_oauth_ready}</strong></div>
    </div>
    <p><a href="/admin/social">← Connexions OAuth</a> · <a href="/admin/social/control-plane">Control plane</a></p>
    <div class="table-wrap"><table><thead><tr><th>Réseau</th><th>Lecture</th><th>Publication</th><th>Analytics</th><th>OAuth</th><th>Read testé</th><th>Publish testé</th><th>Analytics testé</th><th>Validation sûre</th><th>Test non public prêt</th><th>Blocage / prochaine action</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="foot">Garde-fous actifs : social_test_mode=${esc(String(policy.test_mode))} · validation humaine publication=${esc(String(policy.review_required))}. Les tests YouTube restent privés, TikTok reste SELF_ONLY, Pinterest reste Sandbox/Trial. Instagram, Facebook, Threads et LinkedIn ne reçoivent aucun test réel automatique tant qu’une publication pourrait être visible publiquement. X ne déclenche aucune dépense sans validation explicite et Snapchat reste bloqué jusqu’à l’accès produit Snap.</p>
  </main></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
}
