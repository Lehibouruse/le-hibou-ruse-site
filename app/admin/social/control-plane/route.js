import { adminAuthorized, adminUnauthorized } from "../../../../lib/admin-auth.mjs";
import { socialControlPlaneSnapshot, syncSocialControlPlaneToAirtable } from "../../../../lib/social-control-plane.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

function safeHttps(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function badge(ok, yes, no) {
  return `<span class="badge ${ok ? "ok" : "wait"}">${esc(ok ? yes : no)}</span>`;
}

export async function POST(request) {
  if (!adminAuthorized(request)) return adminUnauthorized();
  try {
    const snapshot = await socialControlPlaneSnapshot();
    const result = await syncSocialControlPlaneToAirtable(snapshot);
    const url = new URL("/admin/social/control-plane", request.url);
    url.searchParams.set("synced", String(result.updated_count));
    return Response.redirect(url, 303);
  } catch (error) {
    const url = new URL("/admin/social/control-plane", request.url);
    url.searchParams.set("error", String(error?.message || error).slice(0, 180));
    return Response.redirect(url, 303);
  }
}

export async function GET(request) {
  if (!adminAuthorized(request)) return adminUnauthorized();
  let snapshot;
  try {
    snapshot = await socialControlPlaneSnapshot();
  } catch (error) {
    return new Response(`Control plane indisponible: ${esc(String(error?.message || error))}`, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  const url = new URL(request.url);
  const notice = url.searchParams.get("synced")
    ? `${url.searchParams.get("synced")} comptes Airtable synchronisés.`
    : url.searchParams.get("error")
      ? `Erreur: ${url.searchParams.get("error")}`
      : "";

  const rows = snapshot.providers.map((provider) => {
    const portal = safeHttps(provider.developer_portal);
    const callback = provider.redirect_uri || "—";
    const env = provider.missing_env_names?.length
      ? `<span class="missing">Manque: ${esc(provider.missing_env_names.join(", "))}</span>`
      : '<span class="ok">Secrets serveur prêts</span>';
    const fallback = provider.fallback_webhook_env_names?.length
      ? provider.fallback_webhook_env_names.map((name) => `${esc(name)} ${provider.fallback_webhooks?.[name.replace("HIBOU_SOCIAL_", "").replace("_WEBHOOK_URL", "").toLowerCase()] ? "✓" : "○"}`).join("<br>")
      : "—";
    const oauth = provider.ready_for_human_approval
      ? `<a class="button" href="${esc(provider.oauth_start_path)}">Valider l’autorisation</a>`
      : provider.credential_connected
        ? `<a class="button secondary" href="${esc(provider.oauth_start_path)}">Reconnecter</a>`
        : '<span class="muted">Pas encore cliquable</span>';
    return `<tr>
      <td><strong>${esc(provider.label)}</strong><small>${esc(provider.provider)}</small></td>
      <td><code>${esc(provider.phase)}</code></td>
      <td>${badge(provider.server_env_ready, "OK", "À configurer")}<div class="detail">${env}</div></td>
      <td>${badge(provider.credential_connected, "OAuth connecté", "OAuth non connecté")}</td>
      <td>${badge(provider.publish_scope_ok, "Publication autorisée", "Publication non autorisée")}</td>
      <td>${badge(provider.analytics_scope_ok, "Analytics autorisées", "Analytics incomplètes")}</td>
      <td><code>${esc(callback)}</code></td>
      <td class="detail">${fallback}</td>
      <td><div class="action-text">${esc(provider.human_action)}</div>${portal ? `<a class="portal" href="${esc(portal)}" target="_blank" rel="noopener noreferrer">Portail développeur ↗</a>` : ""}</td>
      <td>${provider.manual_only ? '<span class="missing">Validation externe Snap</span>' : oauth}</td>
    </tr>`;
  }).join("");

  const s = snapshot.summary;
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Control plane social · Le Hibou Rusé</title><style>
  :root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;background:#0d2821;color:#f6efdf;font-family:ui-sans-serif,system-ui;padding:32px}main{max-width:1500px;margin:auto}h1{font-family:Georgia,serif;font-size:42px;margin:0 0 8px}.sub,.muted{color:#aebfb9}.summary{display:flex;gap:10px;flex-wrap:wrap;margin:24px 0}.pill{background:#173a30;border:1px solid #34594d;border-radius:999px;padding:9px 13px}.notice{padding:13px 16px;border:1px solid #c69d51;background:#173a30;border-radius:12px;margin:18px 0}.actions{display:flex;gap:10px;flex-wrap:wrap;margin:18px 0 26px}.button{display:inline-block;background:#d5a84c;color:#102d25;padding:9px 13px;border-radius:999px;text-decoration:none;font-weight:800;border:0;cursor:pointer}.secondary{background:#e9dbc0}.table-wrap{overflow:auto;border-radius:16px;border:1px solid #294b40}table{width:100%;min-width:1520px;border-collapse:collapse;background:#13342b}th,td{text-align:left;padding:13px;border-bottom:1px solid #2c4d43;vertical-align:top;font-size:13px}th{color:#dfbd79}.badge{display:inline-block;border-radius:999px;padding:5px 8px;font-weight:700}.ok{color:#8ee5aa}.wait,.missing{color:#f0c87a}.badge.ok{background:#173f30}.badge.wait{background:#4a3920}.detail{font-size:12px;line-height:1.45;margin-top:7px}.action-text{max-width:360px;line-height:1.45;margin-bottom:8px}.portal{color:#e8ca89}.foot{margin-top:22px;color:#aebfb9;line-height:1.5;font-size:13px}code{background:#091f19;border-radius:6px;padding:4px 6px;word-break:break-all}
  </style></head><body><main>
  <h1>Control plane social</h1><p class="sub">Objectif : pousser chaque réseau jusqu’au dernier point où une validation humaine/OAuth est réellement nécessaire, sans exposer les secrets au modèle ni à Airtable.</p>
  <div class="summary"><span class="pill"><strong>${s.server_env_ready}/${s.oauth_providers}</strong> configs serveur prêtes</span><span class="pill"><strong>${s.ready_for_human_approval}</strong> prêtes pour ton clic OAuth</span><span class="pill"><strong>${s.oauth_connected}/${s.oauth_providers}</strong> OAuth connectés</span><span class="pill"><strong>${s.publish_authorized}/${s.oauth_providers}</strong> publication autorisée</span><span class="pill"><strong>${s.fully_authorized_with_analytics}/${s.oauth_providers}</strong> + analytics</span></div>
  ${notice ? `<div class="notice">${esc(notice)}</div>` : ""}
  <div class="actions"><form method="post"><button class="button" type="submit">Synchroniser l’état vers Airtable</button></form><a class="button secondary" href="/admin/social">Vue OAuth simple</a><a class="button secondary" href="/api/social/control-plane">JSON control plane</a></div>
  <div class="table-wrap"><table><thead><tr><th>Réseau</th><th>Phase</th><th>Serveur</th><th>OAuth</th><th>Publication</th><th>Analytics</th><th>Callback</th><th>Fallback Pipedream/webhook</th><th>Action restante</th><th>Validation</th></tr></thead><tbody>${rows}</tbody></table></div>
  <p class="foot">Les client secrets et tokens ne doivent jamais être saisis dans Airtable ni dans un prompt. Ils restent dans les variables serveur/Vercel ou dans le coffre OAuth AES-256-GCM. Le fallback webhook est optionnel et ne sert qu’en secours contrôlé. Aucun bouton de cette page ne publie un contenu public ; le bouton « Valider l’autorisation » ouvre seulement le consentement OAuth du réseau.</p>
  </main></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
}
