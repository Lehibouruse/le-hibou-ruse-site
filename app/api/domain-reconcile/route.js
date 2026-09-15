import { NextResponse } from "next/server";
import { getRecords, TABLES, updateRecord } from "../../../lib/airtable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const TARGET_URL = "https://d4d5d6.com";
const TARGET_HOST = "d4d5d6.com";

async function updateConfig(records, key, value, description) {
  const record = records.find((item) => String(item?.fields?.Clé || "") === key);
  if (!record) throw new Error(`Configuration absente: ${key}`);
  await updateRecord(TABLES.configuration, record.id, {
    Valeur: value,
    ...(description ? { Description: description } : {}),
  });
}

export async function GET(request) {
  const secret = process.env.CRON_SECRET || "";
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let identity;
  try {
    const response = await fetch(`${TARGET_URL}/api/site-identity`, {
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
      headers: { Accept: "application/json", "User-Agent": "Hibou-Domain-Reconciler/1.0" },
    });
    if (!response.ok) {
      return NextResponse.json({ ok: true, verified: false, promoted: false, reason: `identity_http_${response.status}` });
    }
    identity = await response.json().catch(() => null);
  } catch (error) {
    return NextResponse.json({ ok: true, verified: false, promoted: false, reason: String(error?.message || error).slice(0, 300) });
  }

  const verified = Boolean(
    identity?.ok === true
    && identity?.site === "Le Hibou Rusé"
    && identity?.canonical === true
    && String(identity?.canonical_host || "").toLowerCase() === TARGET_HOST
    && [TARGET_HOST, `www.${TARGET_HOST}`].includes(String(identity?.received_host || "").toLowerCase())
  );
  if (!verified) {
    return NextResponse.json({ ok: true, verified: false, promoted: false, identity });
  }

  const configuration = await getRecords(TABLES.configuration);
  await updateConfig(configuration, "public_site_url", TARGET_URL, "URL publique canonique vérifiée du Hibou Rusé.");
  await updateConfig(configuration, "public_site_host_expected", TARGET_HOST, "Host canonique vérifié obligatoire pour l'ouverture commerciale.");
  await updateConfig(configuration, "domain_verified", "true", "Vérifié automatiquement via /api/site-identity sur d4d5d6.com.");
  await updateConfig(
    configuration,
    "social_link_template",
    `${TARGET_URL}/?utm_source={{provider}}&utm_medium=organic_social&utm_campaign={{campaign}}&utm_content={{content_id}}`,
    "Modèle canonique des liens sociaux après vérification automatique du domaine de marque."
  );

  return NextResponse.json({
    ok: true,
    verified: true,
    promoted: true,
    public_site_url: TARGET_URL,
    host: TARGET_HOST,
  }, { headers: { "Cache-Control": "no-store" } });
}
