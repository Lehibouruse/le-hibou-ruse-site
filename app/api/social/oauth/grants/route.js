import { adminAuthorized, adminUnauthorized } from "../../../../../lib/admin-auth.mjs";
import { auditSocialGrants, socialGrantSummary } from "../../../../../lib/social-grant-audit.mjs";
import { socialCredentialStatuses } from "../../../../../lib/social-credential-vault.mjs";
import { oauthProviderReadiness } from "../../../../../lib/social-oauth.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  if (!adminAuthorized(request)) return adminUnauthorized();
  try {
    const readiness = oauthProviderReadiness();
    const credentials = await socialCredentialStatuses();
    const providers = auditSocialGrants(readiness, credentials);
    return Response.json({
      ok: true,
      generated_at: new Date().toISOString(),
      summary: socialGrantSummary(providers),
      providers,
      safety: {
        secrets_exposed: false,
        public_publication_triggered: false,
        note: "Ce diagnostic ne lance aucun OAuth et aucune publication; il ne retourne que des métadonnées non secrètes.",
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ ok: false, error: String(error?.message || error).slice(0, 500) }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
