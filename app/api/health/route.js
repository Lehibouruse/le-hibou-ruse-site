import { NextResponse } from "next/server";
import { queryRecords, TABLES } from "../../../lib/airtable";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const started = Date.now();
  try {
    const [jobs, journal] = await Promise.all([
      queryRecords(TABLES.jobs, { sortField: "created_at", sortDirection: "desc", pageSize: 1 }),
      queryRecords(TABLES.journal, { pageSize: 1 }),
    ]);
    return NextResponse.json({
      ok: true,
      checks: { site: "ok", airtable: "ok", jobs: jobs.length ? "ok" : "empty", journal: journal.length ? "ok" : "empty" },
      openai_calls: 0,
      duration_ms: Date.now() - started,
      checked_at: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json({ ok: false, checks: { site: "ok", airtable: "error" }, openai_calls: 0, checked_at: new Date().toISOString() }, { status: 503 });
  }
}
