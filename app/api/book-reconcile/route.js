import { NextResponse } from "next/server";
import { getRecords, TABLES, updateRecord } from "../../../lib/airtable";
import { bookQualityGate } from "../../../lib/book-quality.mjs";
import { verifyGithubActionsToken } from "../../../lib/github-oidc.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_RECONCILIATIONS = 3;

function actionName(record) {
  return record?.fields?.action?.name || record?.fields?.action || "";
}

function statusName(record) {
  return record?.fields?.status?.name || record?.fields?.status || "";
}

function params(record) {
  try { return JSON.parse(record?.fields?.parameters || "{}"); }
  catch { return {}; }
}

function completedV2bCoverage(jobs, bookRecordId) {
  const covered = new Set();
  for (const job of jobs) {
    if (actionName(job) !== "CREATE_BOOK" || statusName(job) !== "Completed") continue;
    const jobId = String(job.fields?.job_id || "");
    if (!jobId.includes("-v2b-")) continue;
    const p = params(job);
    if (String(p.book_record_id || "") !== bookRecordId) continue;
    const start = Number(p.source_start);
    const end = Number(p.source_end);
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) continue;
    for (let n = start; n <= end; n += 1) covered.add(n);
  }
  return covered;
}

function fullRangeCovered(covered, start, end) {
  for (let n = start; n <= end; n += 1) if (!covered.has(n)) return false;
  return true;
}

export async function POST(request) {
  try {
    const auth = request.headers.get("authorization") || "";
    if (!auth.startsWith("Bearer ")) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    await verifyGithubActionsToken(auth.slice("Bearer ".length));
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error?.message || "Unauthorized").slice(0, 300) }, { status: 401 });
  }

  const [chapters, jobs] = await Promise.all([
    getRecords(TABLES.book, { pageSize: 100 }),
    getRecords(TABLES.jobs, { pageSize: 500 }),
  ]);

  const reconciled = [];
  for (const chapter of chapters) {
    if (reconciled.length >= MAX_RECONCILIATIONS) break;
    const fields = chapter.fields || {};
    const content = String(fields["Contenu V1"] || "").trim();
    const start = Number(fields["Source début"] || 0);
    const end = Number(fields["Source fin"] || 0);
    if (!content || !Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) continue;

    const expected = end - start + 1;
    const covered = completedV2bCoverage(jobs, chapter.id);
    if (!fullRangeCovered(covered, start, end)) continue;

    const qc = bookQualityGate(content, { expectedMontages: expected, firstPart: true });
    const storedCount = Number(fields["Montages couverts"] || 0);
    const storedQc = String(fields["QC éditorial"] || "").toLowerCase();
    const desiredQc = qc.pass ? (qc.warnings.length ? "review" : "pass") : "fail";
    const alreadyCurrent = storedCount === qc.montageCount
      && Number(fields.Caractères || 0) === qc.characters
      && Number(fields["Marqueurs À VÉRIFIER"] || 0) === qc.verifyMarkers
      && storedQc === desiredQc;
    if (alreadyCurrent) continue;

    const note = [
      `Réconciliation automatique assemblage V2B ${start}-${end}: couverture Jobs complète ${expected}/${expected}.`,
      qc.notes || "QC sans remarque.",
      "Le contenu n'a pas été régénéré ni modifié. Validation humaine et Prêt export restent inchangés/fermés.",
    ].join("\n");

    await updateRecord(TABLES.book, chapter.id, {
      "Montages couverts": qc.montageCount,
      Caractères: qc.characters,
      "Marqueurs À VÉRIFIER": qc.verifyMarkers,
      "QC éditorial": desiredQc,
      "Notes QC": note,
      "Prêt export": false,
      "Validation humaine": false,
    });
    reconciled.push({
      id: chapter.id,
      chapter: fields.Chapitre || "",
      range: [start, end],
      expected,
      montage_count: qc.montageCount,
      qc: desiredQc,
      failures: qc.failures,
      warnings: qc.warnings,
    });
  }

  return NextResponse.json({ ok: true, processed: reconciled.length, reconciled });
}
