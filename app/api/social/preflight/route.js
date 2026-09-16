import { NextResponse } from "next/server";
import { queryAllRecords, TABLES } from "../../../../lib/airtable.js";
import { verifyGithubActionsToken } from "../../../../lib/github-oidc.mjs";
import { socialGatewayStatusWithVault } from "../../../../lib/social-credentials-runtime.mjs";
import { buildSocialRoutingPlan } from "../../../../lib/social-routing-plan.mjs";
import { configurationMap, socialPolicy, socialRuntimeEnv } from "../../../../lib/social-runtime.mjs";

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
    const policy = socialPolicy(config);
    const env = socialRuntimeEnv(config, process.env);
    const gateways = await socialGatewayStatusWithVault(env);
    const plan = buildSocialRoutingPlan({
      operation: body.operation || "publish",
      provider: body.provider || "",
      accounts,
      gateways,
      policy,
    });

    return NextResponse.json({
      ok: true,
      authenticated_via: authenticatedVia,
      ...plan,
      policy,
      safety: {
        side_effect_free: true,
        publication_triggered: false,
        oauth_triggered: false,
        secrets_exposed: false,
      },
      checked_at: new Date().toISOString(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = String(error?.message || error).slice(0, 800);
    return NextResponse.json({ ok: false, error: message }, { status: message === "Unauthorized" ? 401 : 400 });
  }
}
