import { adminAuthorized, adminUnauthorized } from "../../../../lib/admin-auth.mjs";
import { queryRecords, TABLES } from "../../../../lib/airtable.js";
import { buildSocialAuthorizationQueue } from "../../../../lib/social-authorization-queue.mjs";
import { socialControlPlaneSnapshot } from "../../../../lib/social-control-plane.mjs";
import { configurationMap, socialRuntimeEnv } from "../../../../lib/social-runtime.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}
function safeHttps(value) {
  try { const url = new URL(String(value || "")); return url.protocol === "https:" ? url.toString() : ""; } catch { return ""; }
}
function stateLabel(value) {
  return ({ DONE: "Terminé", READY_FOR_USER: "Prêt pour toi", EXTERNAL_SETUP_REQUIRED: "Configuration externe", REVIEW_REQUIRED: "Revue permissions", SETUP_REQUIRED: "À préparer" })[value] || value;
}

async function runtimeEnv() {
  try {
    const records = await queryRecords(TABLES.configuration, { pageSize: 100 });
    return socialRuntimeEnv(configurationMap(records), process.env);
  } catch {
    return process.env;
  }
}

export async function GET(request) {
  if (!adminAuthorized(request)) return adminUnauthorized();
  const snapshot = await socialControlPlaneSnapshot(await runtimeEnv());
  const queue = buildSocialAuthorizationQueue(snapshot);
  const next = queue.next;

  const nextCard = next ? `<section class="next"><div class="eyebrow">PROCHAINE ÉTAPE</div><h2>${esc(next.label)}</h2><p>${esc(next.human_action || next.instruction || next.external_blocker)}</p>
    <div class="actions">${safeHttps(next.developer_portal) ? `<a class="button secondary" target="_blank" rel="noopener noreferrer" href="${esc(next.developer_portal)}">Ouvrir le portail développeur ↗</a>` : ""}
    ${next.ready_for_user && next.oauth_start_path ? `<a class="button" href="${esc(next.oauth_start_path)}">Valider l’autorisation OAuth</a>` : ""}</div>
    ${next.callback ? `<p class="callback"><strong>Callback :</strong> <code>${esc(next.callback)}</code></p>` : ""}
    ${next.missing_env_names.length ? `<p class="missing"><strong>Secrets serveur encore nécessaires :</strong> ${esc(next.missing_env_names.join(", "))}. Les valeurs ne doivent pas être collées dans ChatGPT.</p>` : ""}
  </section>` : `<section class="next"><h2>Toutes les autorisations sont terminées</h2><p>Le control plane ne détecte plus d’étape d’autorisation restante.</p></section>`;

  const rows = queue.steps.map((step, index) => `<tr>
    <td>${index + 1}</td><td><strong>${esc(step.label)}</strong><small>${esc(step.networks_covered.join(" + ") || step.provider)}</small></td>
    <td><span class="state ${step.state === "DONE" ? "done" : step.ready_for_user ? "ready" : "wait"}">${esc(stateLabel(step.state))}</span></td>
    <td>${esc(step.phase)}</td><td>${step.server_env_ready ? "✅" : "—"}</td><td>${step.credential_connected ? "✅" : "—"}</td>
    <td><div>${esc(step.instruction || step.human_action)}</div><small>${esc(step.external_blocker)}</small></td>
    <td>${safeHttps(step.developer_portal) ? `<a href="${esc(step.developer_portal)}" target="_blank" rel="noopener noreferrer">Portail ↗</a>` : "—"}${step.ready_for_user && step.oauth_start_path ? `<br><a href="${esc(step.oauth_start_path)}">OAuth →</a>` : ""}</td>
  </tr>`).join("");

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Autoriser les réseaux · Le Hibou Rusé</title><style>
    :root{color-scheme:dark}body{margin:0;background:#102d25;color:#f8f0df;font-family:ui-sans-serif,system-ui;padding:36px}main{max-width:1450px;margin:auto}h1{font-family:Georgia,serif;font-size:43px;margin:0 0 8px}.sub{color:#b9c8c2;line-height:1.55;max-width:950px}.next{margin:26px 0;padding:24px;border:1px solid #b89554;background:#15352d;border-radius:18px}.next h2{font-size:30px;margin:5px 0 10px}.eyebrow{font-size:12px;letter-spacing:.12em;color:#d9b875;font-weight:800}.actions{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0}.button{display:inline-block;background:#d5a84c;color:#102d25;padding:10px 15px;border-radius:999px;text-decoration:none;font-weight:800}.secondary{background:#244a3e;color:#f8f0df;border:1px solid #496b60}.callback,.missing{color:#c5d1cc;line-height:1.5}.missing{color:#eac887}code{background:#0b211b;padding:5px 7px;border-radius:6px;word-break:break-all}.summary{display:flex;gap:10px;flex-wrap:wrap;margin:22px 0}.pill{background:#173a30;border:1px solid #31564a;border-radius:999px;padding:9px 13px}.table-wrap{overflow:auto;border:1px solid #294b40;border-radius:16px}table{width:100%;min-width:1250px;border-collapse:collapse;background:#15352d}th,td{text-align:left;padding:12px;border-bottom:1px solid #2d4d43;vertical-align:top;font-size:13px}th{color:#d9b875}td small{display:block;color:#8ea69d;margin-top:5px;max-width:420px}.state{font-weight:700}.done{color:#8ee5aa}.ready{color:#d9b875}.wait{color:#d6c8a7}a{color:#e8ca89}.foot{margin-top:22px;color:#aebfb9;line-height:1.55}@media(max-width:850px){body{padding:20px}}</style></head><body><main>
    <h1>Autorisations réseaux</h1><p class="sub">Une étape à la fois. Cette page ne lance rien toute seule : elle réduit la session humaine au portail nécessaire puis, quand l’app est prête, au bouton OAuth. Instagram + Facebook sont regroupés sous Meta pour éviter de refaire deux fois la même configuration.</p>
    <div class="summary"><span class="pill">Terminés : <strong>${queue.summary.completed}/${queue.summary.total}</strong></span><span class="pill">Prêts pour ton clic OAuth : <strong>${queue.summary.ready_for_user}</strong></span><span class="pill">Configurations externes restantes : <strong>${queue.summary.external_setup_required}</strong></span></div>
    ${nextCard}
    <p><a href="/admin/social">Connexions OAuth</a> · <a href="/admin/social/readiness">Readiness</a> · <a href="/admin/social/control-plane">Control plane</a></p>
    <div class="table-wrap"><table><thead><tr><th>#</th><th>Provider</th><th>État</th><th>Phase machine</th><th>Env serveur</th><th>OAuth</th><th>Instruction</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="foot">Aucun secret n’est affiché. Les Client Secret restent côté serveur. Aucun post public, aucun achat X et aucun consentement OAuth ne sont déclenchés par l’ouverture de cette page.</p>
  </main></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
}
