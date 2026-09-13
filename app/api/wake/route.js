import { NextResponse } from "next/server";
import { queryRecords, TABLES } from "../../../lib/airtable";
import { githubOidcAudience, verifyGithubActionsToken } from "../../../lib/github-oidc.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORCHESTRATOR_PATH = "/api/orchestrator";
const MAX_BATCH = 4;

function baseUrl(request) {
  return new URL(request.url).origin;
}

async function eligibleJobsCount() {
  const records = await queryRecords(TABLES.jobs, {
    filterByFormula: "OR({status}='Pending',AND({status}='Retry',OR({next_run_at}=BLANK(),{next_run_at}<=NOW())),AND({status}='Running',{lease_expires_at}!=BLANK(),{lease_expires_at}<=NOW()))",
    pageSize: MAX_BATCH,
  });
  return records.length;
}

export async function POST(request) {
  try {
    const auth = request.headers.get("authorization") || "";
    if (!auth.startsWith("Bearer ")) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    await verifyGithubActionsToken(auth.slice("Bearer ".length));

    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) return NextResponse.json({ ok: false, error: "CRON_SECRET absent" }, { status: 503 });

    const count = await eligibleJobsCount();
    if (!count) return NextResponse.json({ ok: true, eligible: 0, processed: 0, audience: githubOidcAudience() });

    const outcomes = [];
    for (let index = 0; index < Math.min(count, MAX_BATCH); index += 1) {
      const response = await fetch(`${baseUrl(request)}${ORCHESTRATOR_PATH}`, {
        method: "GET",
        headers: { authorization: `Bearer ${cronSecret}` },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      outcomes.push({ status: response.status, ...payload });
      if (payload.processed === 0) break;
    }

    return NextResponse.json({ ok: true, eligible: count, processed: outcomes.filter((item) => item.processed === 1).length, outcomes });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error?.message || error).slice(0, 500) }, { status: 401 });
  }
}
