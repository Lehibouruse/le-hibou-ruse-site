import { adminAuthorized, adminUnauthorized } from "../../../../lib/admin-auth.mjs";
import { queryRecords, TABLES } from "../../../../lib/airtable.js";
import { buildSocialAppReviewPack } from "../../../../lib/social-app-review-pack.mjs";
import { socialControlPlaneSnapshot } from "../../../../lib/social-control-plane.mjs";
import { configurationMap, socialRuntimeEnv } from "../../../../lib/social-runtime.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
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
  const { packs } = buildSocialAppReviewPack(snapshot);
  const cards = packs.map((pack) => `<section class="card">
    <div class="head"><div><h2>${esc(pack.label)}</h2><span>${esc(pack.current_phase || "phase inconnue")}</span></div>${pack.callback ? `<code>${esc(pack.callback)}</code>` : ""}</div>
    <h3>Texte de soumission / justification</h3><textarea readonly rows="18">${esc(pack.combined_submission_en)}</textarea>
    <details><summary>Détails structurés</summary>
      <p><strong>Use case</strong><br>${esc(pack.purpose_en)}</p>
      <p><strong>Permissions</strong><br>${esc(pack.permissions_en)}</p>
      <p><strong>Validation</strong><br>${esc(pack.validation_en)}</p>
      <p><strong>Data handling</strong><br>${esc(pack.data_handling_en)}</p>
      <p><strong>Current granted scopes</strong><br>${esc(pack.current_granted_scopes || "—")}</p>
      <p><strong>Missing publish scopes</strong><br>${esc(pack.missing_publish_scopes.join(", ") || "—")}</p>
      <p><strong>Missing analytics scopes</strong><br>${esc(pack.missing_analytics_scopes.join(", ") || "—")}</p>
    </details>
  </section>`).join("");
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>App review pack · Le Hibou Rusé</title><style>
    :root{color-scheme:dark}body{margin:0;background:#102d25;color:#f8f0df;font-family:ui-sans-serif,system-ui;padding:36px}main{max-width:1280px;margin:auto}h1{font-family:Georgia,serif;font-size:42px;margin:0 0 8px}.sub{color:#b6c6c0;max-width:950px;line-height:1.55}.card{background:#15352d;border:1px solid #2f5146;border-radius:18px;padding:22px;margin:20px 0}.head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start}.head h2{margin:0 0 4px;font-size:26px}.head span{color:#d9b875;font-size:12px}.head code{max-width:55%;word-break:break-all;background:#0b211b;padding:7px;border-radius:7px}h3{font-size:14px;color:#d9b875;margin-top:20px}textarea{box-sizing:border-box;width:100%;background:#0c241d;color:#f8f0df;border:1px solid #355a4e;border-radius:12px;padding:14px;line-height:1.45;font:13px ui-monospace,SFMono-Regular,Menlo,monospace;resize:vertical}details{margin-top:15px;color:#c3d0cb}summary{cursor:pointer;color:#e8ca89}a{color:#e8ca89}.foot{color:#9fb2aa;line-height:1.55;margin-top:24px}@media(max-width:800px){body{padding:20px}.head{display:block}.head code{display:block;max-width:none;margin-top:10px}}</style></head><body><main>
    <h1>App review pack</h1><p class="sub">Textes prêts à copier dans les consoles développeur lorsqu’elles demandent le cas d’usage, la justification des permissions, le mode de test ou le traitement des données. Ils décrivent l’architecture réelle du Hibou et ne prétendent jamais qu’une permission ou une review est déjà approuvée.</p>
    <p><a href="/admin/social/authorize">Autorisations</a> · <a href="/admin/social/readiness">Readiness</a> · <a href="/admin/social/control-plane">Control plane</a></p>
    ${cards}
    <p class="foot">Les mots de passe et secrets API ne doivent jamais être copiés dans ces textes. Les valeurs sensibles restent uniquement dans l’environnement serveur/coffre OAuth chiffré.</p>
  </main></body></html>`;
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } });
}
