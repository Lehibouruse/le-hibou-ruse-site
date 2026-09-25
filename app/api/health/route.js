import { NextResponse } from "next/server";
import { queryRecords, TABLES } from "../../../lib/airtable";
import { bearerSecretAuthorized } from "../../../lib/admin-auth.mjs";

export const dynamic = "force-dynamic";

export async function GET(request) {
  if (!bearerSecretAuthorized(request, process.env.CRON_SECRET)) {
    return NextResponse.json({ ok: false }, {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const started = Date.now();
  try {
    const [jobs, journal] = await Promise.all([
      queryRecords(TABLES.jobs, { sortField: "created_at", sortDirection: "desc", pageSize: 1 }),
      queryRecords(TABLES.journal, { pageSize: 1 }),
    ]);
    return NextResponse.json({
      ok: true,
      checks: {
        site: "ok",
        airtable: "ok",
        jobs: jobs.length ? "ok" : "empty",
        journal: journal.length ? "ok" : "empty",
      },
      openai_calls: 0,
      duration_ms: Date.now() - started,
      checked_at: new Date().toISOString(),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({
      ok: false,
      checks: { site: "ok", airtable: "error" },
      openai_calls: 0,
      checked_at: new Date().toISOString(),
    }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
