import { adminAuthorized, adminUnauthorized } from "../../../lib/admin-auth.mjs";
import { oauthProviderReadiness } from "../../../lib/social-oauth.mjs";
import { socialCredentialStatuses, vaultFingerprint } from "../../../lib/social-credential-vault.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SETUP = {
  youtube: { label: "YouTube", portal: "https://console.cloud.google.com/apis/credentials", note: "Créer un client OAuth Web, activer YouTube Data API v3 + YouTube Analytics API et déclarer le callback." },
  meta: { label: "Meta · Instagram + Facebook", portal: "https://developers.facebook.com/apps/", note: "Créer/configurer l’app Meta, ajouter les permissions Page/Instagram et relier la Page au compte Instagram professionnel." },
  tiktok: { label: "TikTok", portal: "https://developers.tiktok.com/apps/", note: "Ajouter Login Kit + Content Posting API. Avant audit, Direct Post reste SELF_ONLY." },
  linkedin: { label: "LinkedIn", portal: "https://developer.linkedin.com/", note: "Configurer OAuth + w_member_social. Pour une organisation, demander w_organization_social; analytics avancés nécessitent Community Management." },
  pinterest: { label: "Pinterest", portal: "https://developers.pinterest.com/apps/", note: "Créer l’app Pinterest, demander Trial/Standard, puis boards:read/write, pins:read/write et user_accounts:read. Le Sandbox permet un test sans publication production." },
  x: { label: "X", portal: "https://developer.x.com/", note: "Créer l’app OAuth 2.0 PKCE, droits écriture/média et callback. X est pay-per-use : aucun achat/crédit n’est engagé automatiquement." },
  threads: { label: "Threads", portal: "https://developers.facebook.com/apps/", note: "Configurer l’app Threads et autoriser threads_basic + threads_content_publish + threads_manage_insights." },
};

function esc(value) { return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char])); }
function safePortal(value) { try { const url = new URL(value); return url.protocol === "https:" ? url.toString() : ""; } catch { return ""; } }
function pinterestReadiness() {
  const ready = Boolean(process.env.PINTEREST_APP_ID && process.env.PINTEREST_APP_SECRET && process.env.HIBOU_SOCIAL_VAULT_KEY);
  return {
    provider: "pinterest", ready,
    redirect_uri: `${new URL(process.env.HIBOU_PUBLIC_BASE_URL || "https://d4d5d6.com").origin}/api/social/oauth/pinterest/callback`,
    scopes: process.env.PINTEREST_OAUTH_SCOPES || "boards:read,boards:write,pins:read,pins:write,user_accounts:read",
    error: ready ? "" : "PINTEREST_APP_ID/PINTEREST_APP_SECRET et coffre OAuth serveur requis",
  };
}

export async function GET(request) {
  if (!adminAuthorized(request)) return adminUnauthorized();
  const readiness = [...oauthProviderReadiness(), pinterestReadiness()];
  const credentials = await socialCredentialStatuses().catch(() => []);
  let fingerprint = "non configuré"; try { fingerprint = vaultFingerprint(); } catch {}
  const url = new URL(request.url);
  const notice = url.searchParams.get("connected") ? `Connexion ${url.searchParams.get("connected")} enregistrée.` : url.searchParams.get("error") ? `Erreur OAuth: ${url.searchParams.get("error")}` : "";

  const rows = readiness.map((provider) => {
    const setup = SETUP[provider.provider] || { label: provider.provider, portal: "", note: "" };
    const stored = credentials.find((item) => item.provider === provider.provider);
    const connected = stored?.status === "Connected";
    const portal = safePortal(setup.portal);
    const action = provider.ready ? `<a class="button" href="/api/social/oauth/${esc(provider.provider)}/start">${connected ? "Reconnecter" : "Connecter"}</a>` : `<span class="missing">Configuration app requise</span>`;
    return `<tr><td><strong>${esc(setup.label)}</strong><small>${esc(provider.provider)}</small></td><td>${connected ? '<span class="ok">Connecté</span>' : '<span class="wait">Non connecté</span>'}</td><td><div>${esc(stored?.scopes || provider.scopes || "—")}</div><small>${esc(setup.note)}</small></td><td><code>${esc(provider.redirect_uri)}</code></td><td>${provider.ready ? '<span class="ok">App prête pour OAuth</span>' : `<span class="missing">${esc(provider.error)}</span>`}</td><td>${portal ? `<a class="portal" href="${esc(portal)}" target="_blank" rel="noopener noreferrer">Ouvrir le portail ↗</a>` : "—"}</td><td>${action}</td></tr>`;
  }).join("");

  const connectedCount = readiness.filter((provider) => credentials.find((item) => item.provider === provider.provider)?.status === "Connected").length;
  const appReadyCount = readiness.filter((provider) => provider.ready).length;
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Connexions sociales · Le Hibou Rusé</title><style>:root{color-scheme:dark}body{margin:0;background:#102d25;color:#f8f0df;font-family:ui-sans-serif,system-ui;padding:40px}main{max-width:1380px;margin:auto}h1{font-family:Georgia,serif;font-size:44px;margin-bottom:8px}.sub{color:#d6c8a7;margin-bottom:20px}.summary{display:flex;gap:12px;flex-wrap:wrap;margin:24px 0}.pill{padding:10px 14px;background:#173a30;border:1px solid #34594d;border-radius:999px}.notice{padding:14px 18px;background:#173a30;border:1px solid #b89554;border-radius:12px;margin:20px 0}.table-wrap{overflow:auto;border-radius:16px}table{width:100%;min-width:1180px;border-collapse:collapse;background:#15352d}th,td{text-align:left;padding:14px;border-bottom:1px solid #2d4d43;font-size:14px;vertical-align:top}th{color:#d9b875}td small{display:block;color:#aebfb9;margin-top:7px;line-height:1.35;max-width:330px}.button{display:inline-block;background:#d5a84c;color:#102d25;padding:9px 13px;border-radius:999px;text-decoration:none;font-weight:700;white-space:nowrap}.portal{color:#e8ca89;text-decoration:none;white-space:nowrap}.portal:hover{text-decoration:underline}.ok{color:#8ee5aa}.wait,.missing{color:#eac887}code{display:inline-block;background:#0b211b;padding:5px 7px;border-radius:6px;word-break:break-all}.foot{margin-top:24px;color:#adbea9;font-size:13px;line-height:1.55}</style></head><body><main><h1>Connexions sociales</h1><p class="sub">OAuth direct · tokens chiffrés · aucun jeton exposé au modèle.</p><div class="summary"><span class="pill"><strong>${connectedCount}/${readiness.length}</strong> comptes OAuth connectés</span><span class="pill"><strong>${appReadyCount}/${readiness.length}</strong> apps prêtes</span><span class="pill">Domaine callback : <strong>d4d5d6.com</strong></span></div>${notice ? `<div class="notice">${esc(notice)}</div>` : ""}<p>Coffre OAuth : <code>${esc(fingerprint)}</code>. Les tokens utilisateurs sont stockés chiffrés ; les client secrets restent des secrets serveur.</p><div class="table-wrap"><table><thead><tr><th>Réseau</th><th>État</th><th>Scopes / préparation</th><th>Callback à déclarer</th><th>Configuration app</th><th>Portail</th><th>OAuth</th></tr></thead><tbody>${rows}</tbody></table></div><p class="foot">Ordre conseillé : rattacher/vérifier d4d5d6.com → créer les apps et secrets serveur → copier exactement les callbacks → cliquer Connecter → lancer le check lecture → seulement ensuite tester une création privée/sandbox. Snapchat reste séparé tant que Snap n’accorde pas une capacité officielle de publication organique serveur.</p></main></body></html>`;
  return new Response(html, { headers: { "Content-Type":"text/html; charset=utf-8", "Cache-Control":"no-store", "X-Robots-Tag":"noindex, nofollow" } });
}
