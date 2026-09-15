import { NextResponse } from "next/server";
import { queryRecords, TABLES, updateRecord } from "../../../lib/airtable";
import { verifyGithubActionsToken } from "../../../lib/github-oidc.mjs";
import { assessDomainIdentity, domainConfigPatch } from "../../../lib/domain-verification.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const EXPECTED_HOST = "d4d5d6.com";

async function configRecord(key) {
  const safe = String(key).replaceAll("'", "\\'");
  const records = await queryRecords(TABLES.configuration, {
    filterByFormula: `AND({Actif}=1,{Clé}='${safe}')`,
    pageSize: 1,
  });
  return records[0] || null;
}

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

  const [domainRecord, publicUrlRecord] = await Promise.all([
    configRecord("domain_verified"),
    configRecord("public_site_url"),
  ]);
  if (!domainRecord) return NextResponse.json({ ok: false, error: "domain_verified config absent" }, { status: 503 });

  const publicUrl = String(publicUrlRecord?.fields?.Valeur || `https://${EXPECTED_HOST}`).trim();
  let origin;
  try {
    const parsed = new URL(publicUrl);
    if (parsed.protocol !== "https:" || parsed.hostname !== EXPECTED_HOST) throw new Error("host invalide");
    origin = parsed.origin;
  } catch {
    return NextResponse.json({ ok: false, error: "public_site_url canonique invalide" }, { status: 422 });
  }

  let response;
  try {
    response = await fetch(`${origin}/api/site-identity`, {
      headers: { Accept: "application/json", "User-Agent": "HIBOU_DOMAIN_VERIFIER_V2" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    // Timeout/DNS/network errors are inconclusive: preserve the previous verification state.
    return NextResponse.json({ ok: true, verified: false, state: "pending", reason: `fetch_failed:${String(error?.name || "error")}` });
  }

  const data = await response.json().catch(() => ({}));
  const marker = response.headers.get("x-hibou-site") || "";
  const assessment = assessDomainIdentity({ status: response.status, ok: response.ok, marker, data });
  const previousVerified = String(domainRecord.fields?.Valeur || "").toLowerCase() === "true";
  const patch = domainConfigPatch(assessment.state, assessment.reason);

  if (patch) {
    const changesState = assessment.state === "verified" ? !previousVerified : previousVerified;
    const hasErrorChange = assessment.state === "mismatch" || String(domainRecord.fields?.Erreur || "") !== "";
    if (changesState || hasErrorChange) {
      await updateRecord(TABLES.configuration, domainRecord.id, patch);
    }
  }

  return NextResponse.json({
    ok: true,
    verified: assessment.verified,
    state: assessment.state,
    reason: assessment.reason,
    status: response.status,
    marker: marker || null,
    received_host: data?.received_host || null,
    canonical: data?.canonical === true,
    previous_verified: previousVerified,
  });
}
