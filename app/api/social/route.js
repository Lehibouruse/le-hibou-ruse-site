import { NextResponse } from "next/server";
import { queryRecords, TABLES } from "../../../lib/airtable";
import { verifyGithubActionsToken } from "../../../lib/github-oidc.mjs";
import { dispatchSocialPost, socialGatewayStatus } from "../../../lib/social-gateway.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function configMap(records) {
  return Object.fromEntries((records || []).map((record) => [record.fields?.Clé, record.fields?.Valeur]));
}

function bool(value, fallback = false) {
  if (value === true || value === false) return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["true", "1", "yes", "oui"].includes(normalized)) return true;
  if (["false", "0", "no", "non"].includes(normalized)) return false;
  return fallback;
}

async function authenticate(request) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) throw new Error("Unauthorized");
  const token = auth.slice("Bearer ".length);
  if (process.env.CRON_SECRET && token === process.env.CRON_SECRET) return { kind: "cron" };
  await verifyGithubActionsToken(token);
  return { kind: "github_oidc" };
}

async function publicationPolicy() {
  const records = await queryRecords(TABLES.configuration, { pageSize: 100 });
  const config = configMap(records);
  return {
    test_mode: bool(config.social_test_mode, true),
    review_required: bool(config.social_publication_requires_review, true),
    first_videos_review_count: Number(config.human_review_first_videos || 10),
  };
}

export async function POST(request) {
  try {
    const identity = await authenticate(request);
    const body = await request.json().catch(() => ({}));
    const policy = await publicationPolicy();

    if (body.operation === "status") {
      return NextResponse.json({
        ok: true,
        authenticated_via: identity.kind,
        policy,
        providers: socialGatewayStatus(),
      });
    }

    if (body.operation !== "dispatch") {
      return NextResponse.json({ ok: false, error: "operation doit être status ou dispatch" }, { status: 400 });
    }

    const humanApproved = body.human_approved === true;
    const requestedLive = body.dry_run === false;
    const liveAllowed = requestedLive
      && !policy.test_mode
      && (!policy.review_required || humanApproved);

    const result = await dispatchSocialPost({
      ...body,
      dry_run: !liveAllowed,
    });

    return NextResponse.json({
      ...result,
      policy,
      live_requested: requestedLive,
      live_allowed: liveAllowed,
      forced_dry_run_reason: liveAllowed
        ? ""
        : policy.test_mode
          ? "social_test_mode"
          : policy.review_required && !humanApproved
            ? "human_review_required"
            : "dry_run_requested",
    });
  } catch (error) {
    const message = String(error?.message || error).slice(0, 1000);
    const status = message === "Unauthorized" ? 401 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
