import { NextResponse } from "next/server";
import { queryRecords, TABLES } from "../../../../lib/airtable.js";
import { verifyGithubActionsToken } from "../../../../lib/github-oidc.mjs";
import { buildSocialAuthorizationQueue } from "../../../../lib/social-authorization-queue.mjs";
import { socialControlPlaneSnapshot } from "../../../../lib/social-control-plane.mjs";
import { configurationMap, socialRuntimeEnv } from "../../../../lib/social-runtime.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authenticate(request) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) throw new Error("Unauthorized");
  const token = auth.slice("Bearer ".length);
  if (process.env.CRON_SECRET && token === process.env.CRON_SECRET) return "cron";
  await verifyGithubActionsToken(token);
  return "github_oidc";
}

async function runtimeEnv() {
  try {
    const records = await queryRecords(TABLES.configuration, { pageSize: 100 });
    return socialRuntimeEnv(configurationMap(records), process.env);
  } catch {
    return process.env;
  }
}

export async function POST(request) {
  try {
    const authenticatedVia = await authenticate(request);
    const snapshot = await socialControlPlaneSnapshot(await runtimeEnv());
    const queue = buildSocialAuthorizationQueue(snapshot);
    return NextResponse.json({
      ok: true,
      authenticated_via: authenticatedVia,
      ...queue,
      safety: {
        planning_only: true,
        oauth_triggered: false,
        publication_triggered: false,
        secrets_exposed: false,
        paid_api_purchase_triggered: false,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = String(error?.message || error).slice(0, 800);
    return NextResponse.json({ ok: false, error: message }, { status: message === "Unauthorized" ? 401 : 500 });
  }
}
