import { adminOrServiceAuthorized, serviceUnauthorized } from "../../../../lib/admin-auth.mjs";
import { queryRecords, TABLES } from "../../../../lib/airtable.js";
import { verifyGithubActionsToken } from "../../../../lib/github-oidc.mjs";
import { socialControlPlaneSnapshot, syncSocialControlPlaneToAirtable } from "../../../../lib/social-control-plane.mjs";
import { syncSocialRoutingPlanToAirtable } from "../../../../lib/social-routing-airtable.mjs";
import { configurationMap, socialRuntimeEnv } from "../../../../lib/social-runtime.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const OIDC_WORKFLOW = "social-control-plane-sync.yml";

async function authorized(request) {
  if (adminOrServiceAuthorized(request)) return true;
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return false;
  try {
    await verifyGithubActionsToken(auth.slice("Bearer ".length), { allowedWorkflowFiles: [OIDC_WORKFLOW] });
    return true;
  } catch {
    return false;
  }
}

async function controlPlaneEnv() {
  try {
    const records = await queryRecords(TABLES.configuration, { pageSize: 100 });
    return socialRuntimeEnv(configurationMap(records), process.env);
  } catch {
    return process.env;
  }
}

export async function GET(request) {
  if (!(await authorized(request))) return serviceUnauthorized();
  try {
    const env = await controlPlaneEnv();
    const snapshot = await socialControlPlaneSnapshot(env);
    return Response.json({ ok: true, ...snapshot }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ ok: false, error: String(error?.message || error).slice(0, 1000) }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request) {
  if (!(await authorized(request))) return serviceUnauthorized();
  try {
    const body = await request.json().catch(() => ({}));
    if (body.action !== "sync_airtable") {
      return Response.json({ ok: false, error: "action non prise en charge" }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    const env = await controlPlaneEnv();
    const snapshot = await socialControlPlaneSnapshot(env);
    const airtable = await syncSocialControlPlaneToAirtable(snapshot, env);
    const routing = await syncSocialRoutingPlanToAirtable(env);
    return Response.json({ ok: true, summary: snapshot.summary, airtable, routing, safety: snapshot.safety }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ ok: false, error: String(error?.message || error).slice(0, 1000) }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
