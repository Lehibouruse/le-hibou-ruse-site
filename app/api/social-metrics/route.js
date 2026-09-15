import { NextResponse } from "next/server";
import { createRecord, getAllRecords, queryRecords, TABLES, updateRecord } from "../../../lib/airtable";
import { escapeFormula } from "../../../lib/commerce.mjs";
import { verifyGithubActionsToken } from "../../../lib/github-oidc.mjs";
import { contentMetricTargets, fetchSocialMetrics, performanceKey, selectMetricTargets } from "../../../lib/social-metrics.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const MAX_TARGETS_PER_RUN = 6;

async function authorized(request) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return false;
  const token = auth.slice("Bearer ".length);
  if (process.env.CRON_SECRET && token === process.env.CRON_SECRET) return true;
  try { await verifyGithubActionsToken(token); return true; } catch { return false; }
}

async function existingPerformance(key) {
  const records = await queryRecords(TABLES.socialPerformance, { filterByFormula: `{Performance Key}='${escapeFormula(key)}'`, pageSize: 2 });
  if (records.length > 1) throw new Error(`Doublon Social Performance: ${key}`);
  return records[0] || null;
}

async function persist(target, metrics, state = "active", error = "") {
  const key = performanceKey(target.provider, target.external_id);
  const fields = {
    "Performance Key": key, Provider: target.provider, "External ID": target.external_id,
    "Content Record ID": target.content_record_id, URL: metrics?.url || target.url || "",
    "Captured At": new Date().toISOString(), Views: Number(metrics?.views || 0), Likes: Number(metrics?.likes || 0),
    Comments: Number(metrics?.comments || 0), Shares: Number(metrics?.shares || 0), Saves: Number(metrics?.saves || 0),
    "Watch Time Seconds": Number(metrics?.watch_time_seconds || 0), "Completion %": Number(metrics?.completion || 0),
    Clicks: Number(metrics?.clicks || 0), "Followers Generated": Number(metrics?.followers_generated || 0),
    Status: state, "Last Error": String(error || "").slice(0, 4000),
  };
  const existing = await existingPerformance(key);
  if (existing) { await updateRecord(TABLES.socialPerformance, existing.id, fields); return { id: existing.id, updated: true }; }
  const created = await createRecord(TABLES.socialPerformance, fields);
  return { id: created?.records?.[0]?.id || "", updated: false };
}

function classify(error) {
  if (error?.code === "credential_missing") return "unavailable";
  if (error?.code === "needs_reauth" || [401, 403].includes(Number(error?.status))) return "needs_reauth";
  return "error";
}

export async function POST(request) {
  if (!(await authorized(request))) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const [contentRecords, performanceRecords] = await Promise.all([
      getAllRecords(TABLES.content, { maxRecords: 2000 }),
      getAllRecords(TABLES.socialPerformance, { maxRecords: 5000 }),
    ]);
    const targets = selectMetricTargets(contentRecords.flatMap(contentMetricTargets), performanceRecords, MAX_TARGETS_PER_RUN);
    if (!targets.length) return NextResponse.json({ ok: true, processed: 0, reason: "no_published_ids" });

    const results = [];
    for (const target of targets) {
      try {
        const metrics = await fetchSocialMetrics(target.provider, target.external_id);
        const saved = await persist(target, metrics, "active", "");
        results.push({ ...target, ok: true, metrics, ...saved });
      } catch (error) {
        const state = classify(error);
        const message = String(error?.message || error).slice(0, 1000);
        if (state !== "unavailable") await persist(target, {}, state, message).catch(() => {});
        results.push({ ...target, ok: false, state, error: message });
      }
    }
    return NextResponse.json({ ok: true, processed: results.length, succeeded: results.filter((item) => item.ok).length, results }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error?.message || error).slice(0, 1000) }, { status: 500 });
  }
}
