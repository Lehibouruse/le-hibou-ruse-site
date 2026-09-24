import { NextResponse } from "next/server";
import queue from "../../../config/local-worker-queue.json";
import { createRecord, queryRecords, TABLES, updateRecord } from "../../../lib/airtable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_JOB_IDS = new Set((queue.jobs || []).map((job) => String(job.id || "")).filter(Boolean));
const ALLOWED_STATUS = new Set(["Running", "Completed", "Error"]);

function cut(value, max = 1000) { return String(value ?? "").slice(0, max); }
function num(value, max = Number.MAX_SAFE_INTEGER) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.max(0, Math.min(max, Math.floor(n))) : 0;
}
function escapeFormula(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll('"', '\\"');
}

export async function POST(request) {
  try {
    const body = await request.json();
    const jobId = cut(body.job_id, 180);
    const status = cut(body.status, 30);
    if (!ALLOWED_JOB_IDS.has(jobId)) return NextResponse.json({ ok: false, error: "job_not_allowed" }, { status: 400 });
    if (!ALLOWED_STATUS.has(status)) return NextResponse.json({ ok: false, error: "status_not_allowed" }, { status: 400 });

    const fields = {
      "Job ID": jobId,
      "Concurrent": cut(body.concurrent, 180),
      "Label": cut(body.label, 500),
      "Statut": status,
      "Worker": cut(body.worker, 180),
      "Fichiers vidéo": num(body.video_count, 1000),
      "Octets": num(body.bytes),
      "Chemin local": cut(body.local_path, 1000),
      "Dernière mise à jour": new Date().toISOString(),
      "Erreur": cut(body.error, 5000),
    };
    if (status === "Completed") fields["Terminé le"] = body.completed_at ? new Date(body.completed_at).toISOString() : new Date().toISOString();

    const existing = await queryRecords(TABLES.localWorkerStatus, {
      filterByFormula: `{Job ID}="${escapeFormula(jobId)}"`,
      pageSize: 1,
    });
    if (existing[0]?.id) await updateRecord(TABLES.localWorkerStatus, existing[0].id, fields);
    else await createRecord(TABLES.localWorkerStatus, fields);

    return NextResponse.json({ ok: true, job_id: jobId, status });
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error?.message || error).slice(0, 300) }, { status: 400 });
  }
}
