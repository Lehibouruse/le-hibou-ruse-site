import { completeSocialAuthorization } from "../../../../../../lib/social-oauth.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function adminUrl(request, params = {}) {
  const url = new URL("/admin/social", request.url);
  for (const [key, value] of Object.entries(params)) if (value) url.searchParams.set(key, String(value));
  return url;
}

export async function GET(request, context) {
  try {
    const { provider } = await context.params;
    const url = new URL(request.url);
    const providerError = url.searchParams.get("error");
    if (providerError) {
      return Response.redirect(adminUrl(request, { error: `${provider}:${providerError}` }), 302);
    }
    const code = url.searchParams.get("code") || "";
    const state = url.searchParams.get("state") || "";
    if (!code || !state) return Response.redirect(adminUrl(request, { error: `${provider}:missing_code_or_state` }), 302);
    const result = await completeSocialAuthorization(provider, { code, state });
    return Response.redirect(adminUrl(request, { connected: result.provider }), 302);
  } catch (error) {
    const message = String(error?.message || error).replace(/[\r\n]+/g, " ").slice(0, 180);
    return Response.redirect(adminUrl(request, { error: message }), 302);
  }
}
