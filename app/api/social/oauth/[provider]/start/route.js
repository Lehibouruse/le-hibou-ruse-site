import { buildSocialAuthorization } from "../../../../../../lib/social-oauth.mjs";
import { buildPinterestAuthorization } from "../../../../../../lib/pinterest-social.mjs";
import { adminAuthorized, adminUnauthorized } from "../../../../../../lib/admin-auth.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, context) {
  if (!adminAuthorized(request)) return adminUnauthorized();
  try {
    const { provider } = await context.params;
    const authorization = provider === "pinterest" ? buildPinterestAuthorization() : buildSocialAuthorization(provider);
    return Response.redirect(authorization.url, 302);
  } catch (error) {
    return new Response(`Connexion impossible: ${String(error?.message || error).slice(0, 500)}`, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
