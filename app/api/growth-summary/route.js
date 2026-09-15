import { NextResponse } from "next/server";
import { getAllRecords, TABLES } from "../../../lib/airtable";
import { funnelSummary } from "../../../lib/growth-summary.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  const secret = String(process.env.CRON_SECRET || "");
  const auth = request.headers.get("authorization") || "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [sales, events] = await Promise.all([
      getAllRecords(TABLES.sales, { maxRecords: 3000 }),
      getAllRecords(TABLES.conversionEvents, { maxRecords: 5000 }),
    ]);
    const summary = funnelSummary(sales, events);
    return NextResponse.json({
      ok: true,
      generated_at: new Date().toISOString(),
      objective: "PORTÉE → RÉTENTION → CLIC → ACHAT",
      summary,
      decision_rule: "Privilégier les créations avec échantillon suffisant, conversion visite→achat forte, revenu/visiteur élevé et remboursement faible. Ne pas optimiser uniquement les likes ou les vues.",
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error?.message || error).slice(0, 1000) }, { status: 500 });
  }
}
