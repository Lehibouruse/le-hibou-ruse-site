import { NextResponse } from "next/server";
import { queryRecords, TABLES, updateRecord } from "../../../lib/airtable";
import { verifyGithubActionsToken } from "../../../lib/github-oidc.mjs";

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
      headers: { Accept: "application/json", "User-Agent": "HIBOU_DOMAIN_VERIFIER_V1" },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
  } catch (error) {
    return NextResponse.json({ ok: true, verified: false, reason: `fetch_failed:${String(error?.name || "error")}` });
  }

  const data = await response.json().catch(() => ({}));
  const marker = response.headers.get("x-hibou-site") || "";
  const verified = response.ok
    && marker === "le-hibou-ruse"
    && data?.site === "Le Hibou Rusé"
    && data?.canonical === true
    && [EXPECTED_HOST, `www.${EXPECTED_HOST}`].includes(String(data?.received_host || "").toLowerCase());

  if (!verified) {
    return NextResponse.json({
      ok: true,
      verified: false,
      status: response.status,
      marker: marker || null,
      received_host: data?.received_host || null,
      canonical: data?.canonical === true,
    });
  }

  if (String(domainRecord.fields?.Valeur || "").toLowerCase() !== "true") {
    await updateRecord(TABLES.configuration, domainRecord.id, {
      Valeur: "true",
      Statut: "Actif",
      "Dernière vérification": new Date().toISOString().slice(0, 10),
    });
  }

  return NextResponse.json({ ok: true, verified: true, host: EXPECTED_HOST, marker });
}
