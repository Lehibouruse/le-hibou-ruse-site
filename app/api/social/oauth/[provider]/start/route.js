import { buildSocialAuthorization } from "../../../../../../lib/social-oauth.mjs";
import { adminAuthorized, adminUnauthorized } from "../../../../../../lib/admin-auth.mjs";
import { queryRecords, TABLES } from "../../../../../../lib/airtable.js";
import { configurationMap, socialRuntimeEnv } from "../../../../../../lib/social-runtime.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function oauthEnv() {
  try {
    const records = await queryRecords(TABLES.configuration, { pageSize: 100 });
    return socialRuntimeEnv(configurationMap(records), process.env);
  } catch {
    return process.env;
  }
}

export async function GET(request, context) {
  if (!adminAuthorized(request)) return adminUnauthorized();
  try {
    const { provider } = await context.params;
    const authorization = buildSocialAuthorization(provider, await oauthEnv());
    return Response.redirect(authorization.url, 302);
  } catch (error) {
    return new Response(`Connexion impossible: ${String(error?.message || error).slice(0, 500)}`, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
