import { NextResponse } from "next/server";
import { verifyGithubActionsToken } from "../../../../lib/github-oidc.mjs";
import { testVaultProviderConnections } from "../../../../lib/social-connection-health.mjs";
import { socialCredentialStatuses } from "../../../../lib/social-credential-vault.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const PROVIDERS = new Set(["youtube", "tiktok", "meta", "linkedin", "x", "threads"]);

async function authenticate(request) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) throw new Error("Unauthorized");
  const token = auth.slice("Bearer ".length);
  if (process.env.CRON_SECRET && token === process.env.CRON_SECRET) return "cron";
  await verifyGithubActionsToken(token);
  return "github_oidc";
}

function providerFromBody(body = {}) {
  const value = String(body.provider || "").trim().toLowerCase();
  if (!value) return "";
  if (!PROVIDERS.has(value)) throw new Error(`Provider non pris en charge: ${value}`);
  return value;
}

export async function POST(request) {
  try {
    const authenticatedVia = await authenticate(request);
    const body = await request.json().catch(() => ({}));
    const requested = providerFromBody(body);
    const statuses = await socialCredentialStatuses();
    const providers = requested
      ? [requested]
      : statuses.filter((item) => item.status === "Connected").map((item) => item.provider).filter((item) => PROVIDERS.has(item));

    const unique = [...new Set(providers)];
    const results = [];
    for (const provider of unique) {
      results.push(...await testVaultProviderConnections(provider));
    }
    const failed = results.filter((item) => !item.ok);
    return NextResponse.json({
      ok: failed.length === 0,
      authenticated_via: authenticatedVia,
      tested_vault_providers: unique,
      results,
      checked_at: new Date().toISOString(),
    }, { status: failed.length ? 207 : 200 });
  } catch (error) {
    const message = String(error?.message || error).slice(0, 800);
    return NextResponse.json({ ok: false, error: message }, { status: message === "Unauthorized" ? 401 : 500 });
  }
}
