import { NextResponse } from "next/server";
import { queryRecords, TABLES } from "../../../lib/airtable";
import { githubOidcAudience, verifyGithubActionsToken } from "../../../lib/github-oidc.mjs";
import { eligibleJobsFormula } from "../../../lib/job-eligibility.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORCHESTRATOR_PATH = "/api/orchestrator";
const MAX_BATCH = 1;

function baseUrl(request) {
  const configured = process.env.HIBOU_PUBLIC_BASE_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  return configured ? new URL(configured).origin : new URL(request.url).origin;
}

async function eligibleJobsCount() {
  const records = await queryRecords(TABLES.jobs, {
    filterByFormula: eligibleJobsFormula(),
    pageSize: MAX_BATCH,
  });
  return records.length;
}

export async function POST(request) {
  try {
    const auth = request.headers.get("authorization") || "";
    if (!auth.startsWith("Bearer ")) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    await verifyGithubActionsToken(auth.slice("Bearer ".length));

    const dryRun = request.headers.get("x-hibou-dry-run") === "true";

    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) return NextResponse.json({ ok: false, error: "CRON_SECRET absent" }, { status: 503 });

    const count = await eligibleJobsCount();
    if (dryRun || !count) {
      return NextResponse.json({ ok: true, dry_run: dryRun, eligible: count, processed: 0, audience: githubOidcAudience() });
    }

    const outcomes = [];
    for (let index = 0; index < Math.min(count, MAX_BATCH); index += 1) {
      const response = await fetch(`${baseUrl(request)}${ORCHESTRATOR_PATH}`, {
        method: "GET",
        headers: { authorization: `Bearer ${cronSecret}` },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      outcomes.push({ status: response.status, ...payload });
      if (!response.ok || payload.processed === 0) break;
    }

    const failed = outcomes.some((item) => item.status >= 400);
    return NextResponse.json(
      { ok: !failed, dry_run: false, eligible: count, processed: outcomes.filter((item) => item.processed === 1).length, outcomes },
      { status: failed ? 502 : 200 },
    );
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error?.message || error).slice(0, 500) }, { status: 401 });
  }
}
