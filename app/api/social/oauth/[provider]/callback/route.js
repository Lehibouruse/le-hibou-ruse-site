import { completeSocialAuthorization } from "../../../../../../lib/social-oauth.mjs";
import { queryRecords, TABLES } from "../../../../../../lib/airtable.js";
import { testVaultProviderConnections } from "../../../../../../lib/social-connection-health.mjs";
import { socialControlPlaneSnapshot, syncSocialControlPlaneToAirtable } from "../../../../../../lib/social-control-plane.mjs";
import { syncSocialRoutingPlanToAirtable } from "../../../../../../lib/social-routing-airtable.mjs";
import { configurationMap, socialRuntimeEnv } from "../../../../../../lib/social-runtime.mjs";
import { oauthPublicResultUrl } from "../../../../../../lib/social-oauth-result.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function resultUrl(request, params = {}) {
  return oauthPublicResultUrl(request.url, params);
}

async function oauthEnv() {
  try {
    const records = await queryRecords(TABLES.configuration, { pageSize: 100 });
    return socialRuntimeEnv(configurationMap(records), process.env);
  } catch {
    return process.env;
  }
}

async function refreshControlPlane(env) {
  try {
    const snapshot = await socialControlPlaneSnapshot(env);
    await syncSocialControlPlaneToAirtable(snapshot, env);
    await syncSocialRoutingPlanToAirtable(env);
    return true;
  } catch {
    return false;
  }
}

export async function GET(request, context) {
  try {
    const { provider } = await context.params;
    const url = new URL(request.url);
    const providerError = url.searchParams.get("error");
    if (providerError) {
      return Response.redirect(resultUrl(request, { error: `${provider}:${providerError}` }), 302);
    }
    const code = url.searchParams.get("code") || "";
    const state = url.searchParams.get("state") || "";
    if (!code || !state) return Response.redirect(resultUrl(request, { error: `${provider}:missing_code_or_state` }), 302);

    const env = await oauthEnv();
    const result = await completeSocialAuthorization(provider, { code, state }, env);
    const tests = await testVaultProviderConnections(result.provider, env)
      .catch((error) => [{ ok: false, error: String(error?.message || error).slice(0, 180) }]);
    const readOk = tests.length > 0 && tests.every((item) => item.ok === true);
    const synced = await refreshControlPlane(env);
    return Response.redirect(resultUrl(request, {
      connected: result.provider,
      tested: readOk ? "read_ok" : "read_failed",
      synced: synced ? "1" : "",
    }), 302);
  } catch (error) {
    const message = String(error?.message || error).replace(/[\r\n]+/g, " ").slice(0, 180);
    return Response.redirect(resultUrl(request, { error: message }), 302);
  }
}
