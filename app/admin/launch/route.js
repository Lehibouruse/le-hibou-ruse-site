import { adminAuthorized, adminUnauthorized } from "../../../lib/admin-auth.mjs";
import { configMap, getRecords, queryRecords, TABLES } from "../../../lib/airtable";
import { githubInfrastructureStatus, systemHealthHeartbeat } from "../../../lib/infrastructure-observability.mjs";
import { commerceTestReadiness, commercialReadiness } from "../../../lib/launch-readiness.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function checkRows(checks = []) {
  const entries = Array.isArray(checks)
    ? checks.map((item) => [item?.key || "contrôle", item])
    : Object.entries(checks || {});
  return entries.map(([key, value]) => {
    const ok = value === true || value?.ok === true;
    const detail = typeof value === "object" && value !== null ? (value.detail || value.value || "") : "";
    return `<tr><td><strong>${esc(key)}</strong></td><td class="${ok ? "ok" : "bad"}">${ok ? "OK" : "BLOQUÉ"}</td><td>${esc(detail)}</td></tr>`;
  }).join("");
}

function blockerText(item) { return item?.detail || item?.key || item || "Blocage sans détail"; }
function statusClass(value) {
  const state = String(value || "").toLowerCase();
  if (["ok", "success", "healthy"].includes(state)) return "ok";
  if (["critical", "failure", "error", "blocked"].includes(state)) return "bad";
  return "warn";
}
function fmtDate(value) {
  const ms = Date.parse(String(value || ""));
  return Number.isFinite(ms) ? new Date(ms).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "short", timeStyle: "medium" }) : "—";
}
function infraRow(label, state, detail) {
  return `<tr><td><strong>${esc(label)}</strong></td><td class="${statusClass(state)}">${esc(String(state || "UNKNOWN").toUpperCase())}</td><td>${esc(detail || "")}</td></tr>`;
}
function testStateCard(label, group) {
  const ready = group?.ready === true;
  return `<div class="card"><span>${esc(label)}</span><strong class="${ready ? "ok" : "warn"}">${ready ? "PRÊT" : "À CONFIGURER"}</strong></div>`;
}
function testBlockers(group) {
  const blockers = (group?.blockers || []).map((item) => `<li>${esc(blockerText(item))}</li>`).join("");
  return blockers || '<li class="ok">Aucun blocage de test.</li>';
}

export async function GET(request) {
  if (!adminAuthorized(request)) return adminUnauthorized();

  const [configuration, products, chapters, legal, watchdogEvents, github] = await Promise.all([
    getRecords(TABLES.configuration),
    getRecords(TABLES.products),
    getRecords(TABLES.book),
    getRecords(TABLES.legal),
    queryRecords(TABLES.journal, {
      filterByFormula: `{Workflow}='HIBOU_SYSTEM_WATCHDOG_V1'`,
      sortField: "Dernière exécution",
      sortDirection: "desc",
      pageSize: 6,
      priorityAware: false,
    }).catch(() => []),
    githubInfrastructureStatus(),
  ]);
  const config = configMap(configuration);
  const product = products.find((record) => record.fields.Actif)?.fields || {};
  const readiness = commercialReadiness({ config, product, chapters, legal });
  const testReadiness = commerceTestReadiness({ config, product });
  const heartbeat = systemHealthHeartbeat(config);
  const report = heartbeat.report || {};
  const counts = report.counts || {};
  const blockers = (readiness.blockers || []).map((item) => `<li>${esc(blockerText(item))}</li>`).join("");

  const watchdogState = heartbeat.stale ? "stale" : heartbeat.last_status;
  const openAiState = heartbeat.stale || !heartbeat.known ? "unknown" : report.openai?.circuit_active ? "degraded" : "ok";
  const jobsState = heartbeat.stale || !heartbeat.known ? "unknown" : Number(counts.running_expired || 0) > 0 ? "critical" : (Number(counts.jobs_error || 0) > 0 || Number(counts.retry_overdue || 0) > 0) ? "degraded" : "ok";
  const commerceState = heartbeat.stale || !heartbeat.known ? "unknown" : Number(counts.commerce_stuck || 0) > 0 ? "critical" : Number(counts.commerce_manual_review || 0) > 0 ? "degraded" : "ok";
  const socialState = heartbeat.stale || !heartbeat.known ? "unknown" : Number(counts.social_needs_reauth || 0) > 0 ? "degraded" : "ok";
  const ciState = !github.known ? "unknown" : github.ci.conclusion === "failure" ? "failure" : github.ci.conclusion === "success" && github.ci.aligned_with_main ? "success" : "pending";
  const vercelRuntimeKnown = github.vercel.aligned_with_main !== null;
  const vercelState = !github.known ? "unknown" : github.vercel.status === "failure" ? "failure" : github.vercel.status === "success" && github.vercel.aligned_with_main === true ? "success" : github.vercel.status === "success" && !vercelRuntimeKnown ? "pending" : "pending";

  const infraRows = [
    infraRow("Watchdog", watchdogState, heartbeat.checked_at ? `Dernier heartbeat ${fmtDate(heartbeat.checked_at)}${heartbeat.stale ? ` · dernier état connu ${heartbeat.last_status}` : ""}` : "Aucun heartbeat persistant reçu"),
    infraRow("Airtable", "ok", "Configuration, produit, livre et juridique chargés dans cette requête"),
    infraRow("OpenAI", openAiState, report.openai?.circuit_active ? `Circuit crédit ouvert jusqu’au ${fmtDate(report.openai?.circuit_until)}` : heartbeat.known && !heartbeat.stale ? "Circuit crédit fermé au dernier heartbeat" : "État du circuit non fiable tant que le heartbeat est absent ou stale"),
    infraRow("Jobs Core", jobsState, `Total ${Number(counts.jobs || 0)} · Running ${Number(counts.jobs_running || 0)} · Retry ${Number(counts.jobs_retry || 0)} · Manual Review ${Number(counts.jobs_manual_review || 0)} · Error ${Number(counts.jobs_error || 0)} · baux invalides ${Number(counts.running_expired || 0)}`),
    infraRow("Commerce / Digify", commerceState, `Traitements actifs ${Number(counts.commerce_active || 0)} · baux invalides ${Number(counts.commerce_stuck || 0)} · revues ${Number(counts.commerce_manual_review || 0)}`),
    infraRow("OAuth sociaux", socialState, `Credentials connectés ${Number(counts.social_connected || 0)}/${Number(counts.social_credentials || 0)} · Needs reauth ${Number(counts.social_needs_reauth || 0)}`),
    infraRow("GitHub Actions", ciState, github.known ? `CI ${github.ci.conclusion || github.ci.status} · main ${github.github_main_short || "?"} · run aligné ${github.ci.aligned_with_main ? "oui" : "non/pending"} · ${fmtDate(github.ci.updated_at)}` : `État indisponible: ${github.error || "GitHub non joignable"}`),
    infraRow("Vercel", vercelState, github.known ? `Statut commit main ${github.vercel.status} · runtime ${github.vercel.deployed_short || "SHA indisponible"} · aligné à main ${github.vercel.aligned_with_main === true ? "oui" : github.vercel.aligned_with_main === false ? "non" : "inconnu"}` : "État Vercel non confirmé"),
  ].join("");

  const activeIssues = (report.issues || []).length
    ? `<ul>${report.issues.map((item) => `<li><strong>${esc(item.code || "incident")}</strong> · ${esc(item.severity || "unknown")} · ${Number(item.count || 0)}</li>`).join("")}</ul>`
    : `<p class="${heartbeat.known && !heartbeat.stale ? "ok" : "warn"}"><strong>${heartbeat.known && !heartbeat.stale ? "Aucun incident actif au dernier heartbeat." : "Incidents actifs inconnus tant que le heartbeat n’est pas frais."}</strong></p>`;
  const recentWatchdog = watchdogEvents.length
    ? `<table><thead><tr><th>Date</th><th>Action</th><th>Statut</th></tr></thead><tbody>${watchdogEvents.map((row) => `<tr><td>${esc(fmtDate(row.fields?.["Dernière exécution"]))}</td><td>${esc(row.fields?.Action || "—")}</td><td>${esc(row.fields?.Statut || "—")}</td></tr>`).join("")}</tbody></table>`
    : `<p class="warn">Aucun événement watchdog journalisé. Le heartbeat ci-dessus est la source de vérité pour distinguer un système sain d’un watchdog arrêté.</p>`;

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Lancement · Le Hibou Rusé</title><style>
    :root{color-scheme:dark}body{margin:0;background:#102d25;color:#f8f0df;font-family:ui-sans-serif,system-ui;padding:40px}main{max-width:1120px;margin:auto}h1{font-family:Georgia,serif;font-size:44px;margin:0 0 8px}.sub{color:#d6c8a7;line-height:1.5;margin-bottom:28px}.hero{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.card{background:#15352d;border:1px solid #2f5146;border-radius:16px;padding:18px}.card span{display:block;color:#adc0b8;font-size:13px}.card strong{display:block;font-size:24px;margin-top:7px}.ok{color:#8ee5aa}.bad{color:#ff9e8f}.warn{color:#eac887}.box{margin-top:28px;background:#15352d;border:1px solid #2f5146;border-radius:16px;padding:20px}.box h2{margin-top:0}.split{display:grid;grid-template-columns:1fr 1fr;gap:18px}.split h3{margin:0 0 10px}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:11px 10px;border-bottom:1px solid #2d4d43;font-size:14px}th{color:#d9b875}ul{line-height:1.65;padding-left:22px}.links{display:flex;gap:10px;flex-wrap:wrap;margin-top:24px}.links a{background:#d5a84c;color:#102d25;text-decoration:none;padding:9px 13px;border-radius:999px;font-weight:700}.foot{color:#adbea9;font-size:13px;margin-top:24px}@media(max-width:760px){body{padding:22px}.hero,.split{grid-template-columns:1fr 1fr}h1{font-size:36px}.box{overflow-x:auto}}@media(max-width:520px){.hero,.split{grid-template-columns:1fr}}
  </style></head><body><main>
    <h1>Prêt au lancement ?</h1><p class="sub">Tableau privé de vérité. La readiness commerciale, la capacité à tester Lemon/Digify et la santé technique restent séparées : un test prêt ne vaut jamais autorisation de vendre.</p>
    <div class="hero">
      <div class="card"><span>État commercial</span><strong class="${readiness.ready ? "ok" : "bad"}">${readiness.ready ? "PRÊT" : "BLOQUÉ"}</strong></div>
      ${testStateCard("Lemon test", testReadiness.lemon)}
      ${testStateCard("Digify test", testReadiness.digify)}
      <div class="card"><span>Santé Core</span><strong class="${statusClass(watchdogState)}">${esc(String(watchdogState || "unknown").toUpperCase())}</strong></div>
      <div class="card"><span>Livre</span><strong>${Number(readiness.readyBookChapters || 0)}/${Number(readiness.totalBookChapters || 0)}</strong></div>
      <div class="card"><span>Édition</span><strong>${esc(readiness.edition || "—")}</strong></div>
    </div>
    <section class="box"><h2>Tests commerce non-live</h2><div class="split"><div><h3>Lemon Squeezy</h3><table><thead><tr><th>Contrôle</th><th>État</th><th>Détail</th></tr></thead><tbody>${checkRows(testReadiness.lemon.checks)}</tbody></table><ul>${testBlockers(testReadiness.lemon)}</ul></div><div><h3>Digify</h3><table><thead><tr><th>Contrôle</th><th>État</th><th>Détail</th></tr></thead><tbody>${checkRows(testReadiness.digify.checks)}</tbody></table><ul>${testBlockers(testReadiness.digify)}</ul></div></div></section>
    <section class="box"><h2>Infrastructure réelle</h2><table><thead><tr><th>Composant</th><th>État</th><th>Preuve / détail</th></tr></thead><tbody>${infraRows}</tbody></table></section>
    <section class="box"><h2>Incidents actifs</h2>${activeIssues}</section>
    <section class="box"><h2>Derniers événements watchdog</h2>${recentWatchdog}</section>
    <section class="box"><h2>Contrôles commerciaux stricts</h2><table><thead><tr><th>Contrôle</th><th>État</th><th>Détail</th></tr></thead><tbody>${checkRows(readiness.checks)}</tbody></table></section>
    <section class="box"><h2>Blocages restants avant vente publique</h2>${blockers ? `<ul>${blockers}</ul>` : '<p class="ok"><strong>Aucun blocage commercial déclaré.</strong></p>'}</section>
    <div class="links"><a href="/admin/social">Connexions sociales détaillées</a><a href="/admin/growth">Growth</a></div>
    <p class="foot">Ne pas activer manuellement le commerce pour contourner ce tableau. Les états UNKNOWN, STALE ou PENDING ne valent jamais validation, et un état « test prêt » n'autorise jamais une vente live.</p>
  </main></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
}
