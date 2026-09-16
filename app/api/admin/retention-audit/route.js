import { NextResponse } from "next/server";
import { adminAuthorized, adminUnauthorized } from "../../../../lib/admin-auth.mjs";
import { queryAllRecords, TABLES } from "../../../../lib/airtable";
import { retentionAudit } from "../../../../lib/data-retention.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  if (!adminAuthorized(request)) return adminUnauthorized();

  const [conversionEvents, automationLogs, prospects, sales] = await Promise.all([
    queryAllRecords(TABLES.conversionEvents, {}, { maxRecords: 5000 }),
    queryAllRecords(TABLES.journal, {}, { maxRecords: 5000 }),
    queryAllRecords(TABLES.leads, {}, { maxRecords: 2000 }),
    queryAllRecords(TABLES.sales, {}, { maxRecords: 5000 }),
  ]);

  const audit = retentionAudit({ conversionEvents, automationLogs, prospects, sales });
  return NextResponse.json(audit, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
    },
  });
}
