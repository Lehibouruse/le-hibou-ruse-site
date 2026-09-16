import { NextResponse } from "next/server";
import { queryAllRecords, TABLES } from "../../../../lib/airtable.js";
import { verifyGithubActionsToken } from "../../../../lib/github-oidc.mjs";
import { socialGatewayStatusWithVault } from "../../../../lib/social-credentials-runtime.mjs";
import { configurationMap, socialRuntimeEnv } from "../../../../lib/social-runtime.mjs";
import { buildSocialValidationPlan } from "../../../../lib/social-validation-plan.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

async function authenticate(request) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) throw new Error("Unauthorized");
  const token = auth.slice("Bearer ".length);
  if (process.env.CRON_SECRET && token === process.env.CRON_SECRET) return "cron";
  await verifyGithubActionsToken(token);
  return "github_oidc";
}

export async function POST(request) {
  try {
    const authenticatedVia = await authenticate(request);
    const body = await request.json().catch(() => ({}));
    const [accounts, configuration] = await Promise.all([
      queryAllRecords(TABLES.socialAccounts, {}, { maxRecords: 50 }),
      queryAllRecords(TABLES.configuration, {}, { maxRecords: 250 }),
    ]);
    const config = configurationMap(configuration);
    const env = socialRuntimeEnv(config, process.env);
    const gateways = await socialGatewayStatusWithVault(env);
    const plan = buildSocialValidationPlan({ accounts, gateways, config, provider: body.provider || "" });

    return NextResponse.json({
      ok: true,
      authenticated_via: authenticatedVia,
      ...plan,
      safety: {
        planning_only: true,
        oauth_triggered: false,
        publication_triggered: false,
        public_test_triggered: false,
        secrets_exposed: false,
      },
      checked_at: new Date().toISOString(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = String(error?.message || error).slice(0, 800);
    return NextResponse.json({ ok: false, error: message }, { status: message === "Unauthorized" ? 401 : 400 });
  }
}
