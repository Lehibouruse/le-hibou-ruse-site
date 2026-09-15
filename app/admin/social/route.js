import { adminAuthorized, adminUnauthorized } from "../../../lib/admin-auth.mjs";
import { oauthProviderReadiness } from "../../../lib/social-oauth.mjs";
import { socialCredentialStatuses, vaultFingerprint } from "../../../lib/social-credential-vault.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

export async function GET(request) {
  if (!adminAuthorized(request)) return adminUnauthorized();
  const readiness = oauthProviderReadiness();
  const credentials = await socialCredentialStatuses().catch(() => []);
  let fingerprint = "non configuré";
  try { fingerprint = vaultFingerprint(); } catch {}
  const url = new URL(request.url);
  const notice = url.searchParams.get("connected")
    ? `Connexion ${url.searchParams.get("connected")} enregistrée.`
    : url.searchParams.get("error")
      ? `Erreur OAuth: ${url.searchParams.get("error")}`
      : "";

  const rows = readiness.map((provider) => {
    const stored = credentials.find((item) => item.provider === provider.provider);
    const connected = stored?.status === "Connected";
    const action = provider.ready
      ? `<a class="button" href="/api/social/oauth/${esc(provider.provider)}/start">${connected ? "Reconnecter" : "Connecter"}</a>`
      : `<span class="missing">Configuration app requise</span>`;
    return `<tr>
      <td><strong>${esc(provider.provider)}</strong></td>
      <td>${connected ? '<span class="ok">Connecté</span>' : '<span class="wait">Non connecté</span>'}</td>
      <td>${esc(stored?.scopes || provider.scopes || "—")}</td>
      <td>${esc(provider.redirect_uri)}</td>
      <td>${provider.ready ? "Prêt OAuth" : esc(provider.error)}</td>
      <td>${action}</td>
    </tr>`;
  }).join("");

  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Connexions sociales · Le Hibou Rusé</title><style>
    :root{color-scheme:dark}body{margin:0;background:#102d25;color:#f8f0df;font-family:ui-sans-serif,system-ui;padding:40px}main{max-width:1200px;margin:auto}h1{font-family:Georgia,serif;font-size:44px;margin-bottom:8px}.sub{color:#d6c8a7;margin-bottom:32px}.notice{padding:14px 18px;background:#173a30;border:1px solid #b89554;border-radius:12px;margin:20px 0}table{width:100%;border-collapse:collapse;background:#15352d;border-radius:16px;overflow:hidden}th,td{text-align:left;padding:14px;border-bottom:1px solid #2d4d43;font-size:14px;vertical-align:top}th{color:#d9b875}.button{display:inline-block;background:#d5a84c;color:#102d25;padding:9px 13px;border-radius:999px;text-decoration:none;font-weight:700}.ok{color:#8ee5aa}.wait,.missing{color:#eac887}code{background:#0b211b;padding:3px 7px;border-radius:6px}.foot{margin-top:24px;color:#adbea9;font-size:13px}</style></head><body><main>
    <h1>Connexions sociales</h1><p class="sub">OAuth direct · tokens chiffrés · aucun jeton exposé au modèle.</p>
    ${notice ? `<div class="notice">${esc(notice)}</div>` : ""}
    <p>Coffre OAuth : <code>${esc(fingerprint)}</code>. Un seul secret maître serveur protège les tokens stockés dans Airtable.</p>
    <table><thead><tr><th>Provider</th><th>État</th><th>Scopes</th><th>Callback à déclarer</th><th>Pré-requis</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table>
    <p class="foot">Snapchat n’est pas présenté ici : la publication organique serveur dépend d’un accès produit/approbation Snap distinct. Les publications restent soumises aux garde-fous Airtable (test mode, validation humaine, idempotence).</p>
  </main></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
}
