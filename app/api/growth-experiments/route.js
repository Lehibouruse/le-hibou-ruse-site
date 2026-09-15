import { NextResponse } from "next/server";
import { createRecord, queryAllRecords, TABLES } from "../../../lib/airtable";
import { verifyGithubActionsToken } from "../../../lib/github-oidc.mjs";
import { contentEfficiencySummary } from "../../../lib/content-efficiency.mjs";
import { funnelSummary } from "../../../lib/growth-summary.mjs";
import { proposeGrowthExperiments } from "../../../lib/growth-experiments.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function authorized(request) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return false;
  await verifyGithubActionsToken(auth.slice("Bearer ".length));
  return true;
}

export async function POST(request) {
  try {
    if (!(await authorized(request))) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [sales, performances, events, existing] = await Promise.all([
      queryAllRecords(TABLES.sales, {}, { maxRecords: 3000 }),
      queryAllRecords(TABLES.socialPerformance, {}, { maxRecords: 3000 }),
      queryAllRecords(TABLES.conversionEvents, {}, { maxRecords: 3000 }),
      queryAllRecords(TABLES.growthExperiments, {}, { maxRecords: 500 }),
    ]);

    const contentRows = contentEfficiencySummary(sales, performances);
    const funnel = funnelSummary(sales, events);
    const proposals = proposeGrowthExperiments({ contentRows, funnel, existing });
    const created = [];

    for (const proposal of proposals) {
      const result = await createRecord(TABLES.growthExperiments, {
        Expérience: proposal.experience,
        Canal: proposal.channel,
        Hypothèse: proposal.hypothesis,
        Statut: "À tester",
        "KPI cible": proposal.kpi,
        Résultat: proposal.result,
      });
      const record = result?.records?.[0];
      created.push({ id: record?.id || "", experience: proposal.experience, channel: proposal.channel });
    }

    return NextResponse.json({
      ok: true,
      created_count: created.length,
      created,
      evaluated_content_rows: contentRows.length,
      sample: {
        attributed_visitors: funnel.attributed_visitors || 0,
        checkout_sessions: funnel.attributed_checkout_sessions || 0,
        attributed_purchases: funnel.attributed_purchases || 0,
      },
      publication_triggered: false,
    });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error?.message || error).slice(0, 1000) }, { status: 500 });
  }
}
