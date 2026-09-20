import { NextResponse } from "next/server";
import { configMap, getAllRecords, getRecords, TABLES } from "../../../lib/airtable";
import { verifyGithubActionsToken } from "../../../lib/github-oidc.mjs";
import { commercialReadiness } from "../../../lib/launch-readiness.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorized(request) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) return false;
  const token = auth.slice("Bearer ".length);
  if (process.env.CRON_SECRET && token === process.env.CRON_SECRET) return true;
  try {
    await verifyGithubActionsToken(token);
    return true;
  } catch {
    return false;
  }
}

export async function GET(request) {
  if (!(await authorized(request))) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const [configuration, products, chapters, legal] = await Promise.all([
    getAllRecords(TABLES.configuration, { maxRecords: 500 }),
    getRecords(TABLES.products),
    getRecords(TABLES.book),
    getRecords(TABLES.legal),
  ]);
  const config = configMap(configuration);
  const product = products.find((record) => record.fields.Actif)?.fields || {};
  const readiness = commercialReadiness({ config, product, chapters, legal });

  return NextResponse.json({
    ok: true,
    ready: readiness.ready,
    public_site: readiness.publicSite,
    expected_host: readiness.expectedHost,
    edition: readiness.edition,
    book: {
      ready_chapters: readiness.readyBookChapters,
      total_chapters: readiness.totalBookChapters,
    },
    checks: readiness.checks,
    blockers: readiness.blockers,
  }, {
    headers: { "Cache-Control": "no-store" },
  });
}
