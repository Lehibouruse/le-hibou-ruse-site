import { NextResponse } from "next/server";
import { queryRecords, TABLES } from "../../../lib/airtable";
import { isAgenticAction } from "../../../lib/agent-capabilities.mjs";
import { githubOidcAudience, verifyGithubActionsToken } from "../../../lib/github-oidc.mjs";
import { eligibleJobsFormula } from "../../../lib/job-eligibility.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ORCHESTRATOR_PATH = "/api/orchestrator";
const SOCIAL_SCHEDULER_PATH = "/api/social-scheduler";
const BOOK_SCHEDULER_PATH = "/api/book-scheduler";
const MAX_BATCH = 1;
const HANDLED_BUSINESS_STATUSES = new Set([409, 422]);

function baseUrl(request) {
  const configured = process.env.HIBOU_PUBLIC_BASE_URL
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  return configured ? new URL(configured).origin : new URL(request.url).origin;
}

function actionName(job) {
  return job?.fields?.action?.name || job?.fields?.action || "UNKNOWN";
}

function parameters(job) {
  try { return JSON.parse(job?.fields?.parameters || "{}"); } catch { return {}; }
}

async function firstEligibleJob() {
  const records = await queryRecords(TABLES.jobs, {
    filterByFormula: eligibleJobsFormula(process.env, { includeReserved: true }),
    sortField: "created_at",
    pageSize: MAX_BATCH,
  });
  return records[0] || null;
}

async function delegate(request, cronSecret, path, label) {
  const response = await fetch(`${baseUrl(request)}${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${cronSecret}` },
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));

  // A scheduler can legitimately finish a business Job in Manual Review or
  // reject a non-ready business state. That is a processed outcome, not an
  // infrastructure failure: the next wake must be free to continue the queue.
  if (HANDLED_BUSINESS_STATUSES.has(response.status)) {
    return NextResponse.json({
      ok: true,
      delegated: label,
      handled: true,
      delegated_status: response.status,
      outcome: data?.status || data?.error || "manual_review",
      processed: Number(data?.processed || 1),
      ...data,
    });
  }

  if (!response.ok) {
    return NextResponse.json({
      ok: false,
      delegated: label,
      status: response.status,
      error: data?.error || data?.status || `${label} failed`,
    }, { status: 503 });
  }
  return NextResponse.json({ ok: true, delegated: label, ...data });
}

export async function POST(request) {
  try {
    const auth = request.headers.get("authorization") || "";
    if (!auth.startsWith("Bearer ")) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    await verifyGithubActionsToken(auth.slice("Bearer ".length));

    const dryRun = request.headers.get("x-hibou-dry-run") === "true";
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) return NextResponse.json({ ok: false, error: "CRON_SECRET absent" }, { status: 503 });

    const candidate = await firstEligibleJob();
    if (dryRun || !candidate) {
      return NextResponse.json({
        ok: true,
        dry_run: dryRun,
        eligible: candidate ? 1 : 0,
        processed: 0,
        action: candidate ? actionName(candidate) : "",
        audience: githubOidcAudience(),
      });
    }

    const action = actionName(candidate);
    if (action === "SCHEDULE_POST") {
      return delegate(request, cronSecret, SOCIAL_SCHEDULER_PATH, "social_scheduler");
    }
    if (action === "CREATE_BOOK") {
      return delegate(request, cronSecret, BOOK_SCHEDULER_PATH, "book_scheduler");
    }
    if (!isAgenticAction(action, parameters(candidate))) {
      return delegate(request, cronSecret, ORCHESTRATOR_PATH, "orchestrator");
    }

    return NextResponse.json({
      ok: true,
      dry_run: false,
      eligible: 1,
      processed: 0,
      reason: "github_worker_required",
      action,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error?.message || error).slice(0, 500) }, { status: 401 });
  }
}
