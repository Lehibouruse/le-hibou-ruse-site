import { NextResponse } from "next/server";
import { createRecord, getAllRecords, queryRecords, TABLES, updateRecord } from "../../../lib/airtable";
import { escapeFormula } from "../../../lib/commerce.mjs";
import { verifyGithubActionsToken } from "../../../lib/github-oidc.mjs";
import { markSocialAnalyticsValidated } from "../../../lib/social-account-validation.mjs";
import { contentMetricTargets, fetchSocialMetrics, performanceKey, selectMetricTargets } from "../../../lib/social-metrics-enhanced.mjs";
import { buildSocialPerformanceFields } from "../../../lib/social-performance-fields.mjs";
import { configurationMap, socialRuntimeEnv } from "../../../lib/social-runtime.mjs";

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

async function persist(target, metrics = null, state = "active", error = "") {
  const key = performanceKey(target.provider, target.external_id);
  const fields = buildSocialPerformanceFields({ key, target, metrics, state, error });
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

async function metricsRuntimeEnv() {
  try {
    const records = await queryRecords(TABLES.configuration, { pageSize: 100 });
    return socialRuntimeEnv(configurationMap(records), process.env);
  } catch {
    return process.env;
  }
}

export async function POST(request) {
  if (!(await authorized(request))) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  try {
    const [contentRecords, performanceRecords, env] = await Promise.all([
      getAllRecords(TABLES.content, { maxRecords: 2000 }),
      getAllRecords(TABLES.socialPerformance, { maxRecords: 5000 }),
      metricsRuntimeEnv(),
    ]);
    const targets = selectMetricTargets(contentRecords.flatMap(contentMetricTargets), performanceRecords, MAX_TARGETS_PER_RUN);
    if (!targets.length) return NextResponse.json({ ok: true, processed: 0, reason: "no_published_ids" });

    const results = [];
    for (const target of targets) {
      try {
        const metrics = await fetchSocialMetrics(target.provider, target.external_id, env);
        const saved = await persist(target, metrics, "active", "");
        const analyticsValidation = await markSocialAnalyticsValidated(target.provider, metrics)
          .catch((error) => ({ updated: false, reason: `airtable_state_error:${String(error?.message || error).slice(0, 300)}` }));
        results.push({ ...target, ok: true, metrics, analytics_validation: analyticsValidation, ...saved });
      } catch (error) {
        const state = classify(error);
        const message = String(error?.message || error).slice(0, 1000);
        // Preserve the last successful counters when a refresh fails or needs re-auth.
        if (state !== "unavailable") await persist(target, null, state, message).catch(() => {});
        results.push({ ...target, ok: false, state, error: message });
      }
    }
    return NextResponse.json({ ok: true, processed: results.length, succeeded: results.filter((item) => item.ok).length, results }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error?.message || error).slice(0, 1000) }, { status: 500 });
  }
}
