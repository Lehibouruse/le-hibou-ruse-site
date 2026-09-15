import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createRecord, getRecord, queryRecords, TABLES, updateRecord } from "../../../lib/airtable";
import { BOOK_EDITORIAL_VERSION, bookInstructions } from "../../../lib/book-editorial.mjs";
import { bookQualityGate } from "../../../lib/book-quality.mjs";
import { eligibleJobsFormula } from "../../../lib/job-eligibility.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const LEASE_MS = 5 * 60 * 1000;
// Real production runs showed 10- and 20-montage outputs can be truncated at the
// response token limit. Five is the largest batch size we accept in production.
const MAX_SOURCE_RECORDS = 5;
const MAX_EXISTING_CHARS = 90000;

function parameters(job) {
  try { return JSON.parse(job?.fields?.parameters || "{}"); }
  catch { throw new Error("parameters doit contenir un JSON valide"); }
}

function actionName(job) {
  return job?.fields?.action?.name || job?.fields?.action || "";
}

async function claim(job) {
  const lockToken = randomUUID();
  const now = new Date();
  await updateRecord(TABLES.jobs, job.id, {
    status: "Running",
    started_at: now.toISOString(),
    completed_at: null,
    error: "",
    lock_token: lockToken,
    lease_expires_at: new Date(now.getTime() + LEASE_MS).toISOString(),
  });
  const current = await getRecord(TABLES.jobs, job.id);
  const status = current?.fields?.status?.name || current?.fields?.status;
  return current?.fields?.lock_token === lockToken && status === "Running" ? { ...current, lockToken } : null;
}

async function owns(job) {
  if (!job?.id || !job?.lockToken) return false;
  const current = await getRecord(TABLES.jobs, job.id);
  return current?.fields?.lock_token === job.lockToken;
}

async function finish(job, status, result, telemetry = {}, error = "") {
  if (!(await owns(job))) return false;
  const fields = {
    status,
    completed_at: ["Completed", "Manual Review", "Error"].includes(status) ? new Date().toISOString() : null,
    result: String(result || "").slice(0, 100000),
    error: String(error || "").slice(0, 5000),
    agent_status: status === "Completed" ? "completed" : status === "Retry" ? "needs_escalation" : "waiting_for_human",
    model_used: telemetry.model || "",
    reasoning_effort: telemetry.reasoning || "",
    estimated_cost_usd: Number(telemetry.cost || 0),
    ai_calls: Number(telemetry.ai_calls || 0),
    response_ids: telemetry.response_id || "",
    lock_token: "",
    lease_expires_at: null,
  };
  if (Number.isFinite(Number(telemetry.input_tokens))) fields.input_tokens = Number(telemetry.input_tokens || 0);
  if (Number.isFinite(Number(telemetry.cached_input_tokens))) fields.cached_input_tokens = Number(telemetry.cached_input_tokens || 0);
  if (Number.isFinite(Number(telemetry.output_tokens))) fields.output_tokens = Number(telemetry.output_tokens || 0);
  await updateRecord(TABLES.jobs, job.id, fields);
  await createRecord(TABLES.journal, {
    Workflow: "HIBOU_BOOK_SCHEDULER_V3",
    Déclencheur: job.fields?.requested_by || "Jobs",
    Action: `CREATE_BOOK · ${job.fields?.job_id || job.id} · ${status}`,
    "Dernière exécution": new Date().toISOString(),
    Erreur: String(error || "").slice(0, 5000),
    Notes: `${BOOK_EDITORIAL_VERSION}; ${String(result || "").slice(0, 9800)}`,
  }).catch(() => {});
  return true;
}

async function retry(job, message) {
  if (!(await owns(job))) return false;
  const count = Number(job.fields?.retry_count || 0) + 1;
  const max = Math.min(2, Number(job.fields?.max_retries ?? 2));
  if (count > max) return finish(job, "Manual Review", message, {}, message);
  await updateRecord(TABLES.jobs, job.id, {
    status: "Retry",
    retry_count: count,
    next_run_at: new Date(Date.now() + Math.min(15 * 60_000, 60_000 * 2 ** count)).toISOString(),
    error: String(message).slice(0, 5000),
    agent_status: "needs_escalation",
    lock_token: "",
    lease_expires_at: null,
  });
  return true;
}

function outputText(response) {
  if (typeof response.output_text === "string") return response.output_text;
  return (response.output || [])
    .flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text)
    .join("");
}

function safeSource(records) {
  return records.map((record) => ({
    id: record.id,
    fields: Object.fromEntries(Object.entries(record.fields || {})
      .filter(([key]) => key !== "Contenu original (verbatim)")
      .map(([key, value]) => [key, typeof value === "string" ? value.slice(0, 12000) : value])),
  }));
}

function usageCost(model, usage = {}) {
  const prices = {
    "gpt-5.6-terra": { input: 2, cached: 0.2, output: 12 },
    "gpt-5.6-sol": { input: 4, cached: 0.4, output: 20 },
  };
  const p = prices[model];
  if (!p) return 0;
  const input = Number(usage?.input_tokens || 0);
  const cached = Math.min(input, Number(usage?.input_tokens_details?.cached_tokens || 0));
  const output = Number(usage?.output_tokens || 0);
  return ((input - cached) * p.input + cached * p.cached + output * p.output) / 1_000_000;
}

export function outputBudget(sourceCount, requested) {
  const count = Number(sourceCount || 0);
  const floor = count >= 5 ? 6000 : count >= 3 ? 5000 : 3500;
  return Math.min(10000, Math.max(floor, Number(requested || floor)));
}

function chapterExpectedMontages(chapter) {
  const start = Number(chapter?.fields?.["Source début"]);
  const end = Number(chapter?.fields?.["Source fin"]);
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) return 0;
  return end - start + 1;
}

async function generatePart({ chapter, source, params }) {
  const model = ["gpt-5.6-sol", "gpt-5.6-terra"].includes(params.model) ? params.model : "gpt-5.6-sol";
  const instructions = bookInstructions({ part: params.part || "1" });
  const input = JSON.stringify({
    version_editoriale: BOOK_EDITORIAL_VERSION,
    chapitre: chapter.fields?.Chapitre || "",
    section: chapter.fields?.Section?.name || chapter.fields?.Section || "",
    notes_editoriales: chapter.fields?.Notes || "",
    partie: String(params.part || "1"),
    plage_sources: `${params.source_start}-${params.source_end}`,
    objectif_mots_partie: Number(params.target_words || 2250),
    montages: safeSource(source),
  });
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      reasoning: { effort: model === "gpt-5.6-sol" ? "high" : "medium" },
      instructions,
      input,
      max_output_tokens: outputBudget(source.length, params.max_output_tokens),
      store: false,
      prompt_cache_key: "hibou-book-editorial-v2",
      text: { verbosity: "medium" },
      metadata: { project: "le-hibou-ruse", purpose: "book-v2", chapter_record: chapter.id, editorial_version: BOOK_EDITORIAL_VERSION },
    }),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(`OpenAI book: ${response.status} ${data?.error?.code || data?.error?.message || "unknown"}`);
    error.retryable = response.status === 408 || response.status === 429 || response.status >= 500;
    throw error;
  }
  const text = outputText(data).trim();
  if (!text) {
    const error = new Error("OpenAI book: réponse vide");
    error.retryable = true;
    throw error;
  }
  return {
    text,
    telemetry: {
      model: data.model || model,
      reasoning: model === "gpt-5.6-sol" ? "high" : "medium",
      input_tokens: Number(data.usage?.input_tokens || 0),
      cached_input_tokens: Number(data.usage?.input_tokens_details?.cached_tokens || 0),
      output_tokens: Number(data.usage?.output_tokens || 0),
      cost: usageCost(data.model || model, data.usage || {}),
      ai_calls: 1,
      response_id: data.id || "",
    },
  };
}

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let claimedJob = null;
  try {
    const eligible = eligibleJobsFormula(process.env);
    const candidates = await queryRecords(TABLES.jobs, {
      filterByFormula: `AND(${eligible},{action}='CREATE_BOOK')`,
      sortField: "created_at",
      pageSize: 5,
    });
    const candidate = candidates.find((job) => actionName(job) === "CREATE_BOOK");
    if (!candidate) return NextResponse.json({ ok: true, processed: 0, reason: "no_create_book" });

    claimedJob = await claim(candidate);
    if (!claimedJob) return NextResponse.json({ ok: true, processed: 0, reason: "lease_not_acquired" });

    const params = parameters(claimedJob);
    const bookRecordId = String(params.book_record_id || "");
    const start = Number(params.source_start);
    const end = Number(params.source_end);
    const expectedMontages = end - start + 1;
    if (!/^rec[A-Za-z0-9]{14}$/.test(bookRecordId) || !Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || expectedMontages > MAX_SOURCE_RECORDS) {
      const message = `CREATE_BOOK invalide: book_record_id rec..., source_start/end requis, maximum ${MAX_SOURCE_RECORDS} montages par Job`;
      await finish(claimedJob, "Manual Review", message, {}, message);
      return NextResponse.json({ ok: false, processed: 1, error: message }, { status: 422 });
    }

    const chapter = await getRecord(TABLES.book, bookRecordId);
    const source = await queryRecords(TABLES.montages, {
      filterByFormula: `AND({Numéro source}>=${start},{Numéro source}<=${end})`,
      sortField: "Numéro source",
      pageSize: MAX_SOURCE_RECORDS,
      priorityAware: false,
    });
    if (source.length !== expectedMontages) {
      const error = new Error(`Corpus incomplet pour ${start}-${end}: ${source.length}/${expectedMontages} montages trouvés`);
      error.retryable = false;
      throw error;
    }

    const generated = await generatePart({ chapter, source, params });
    const partQc = bookQualityGate(generated.text, {
      expectedMontages,
      firstPart: String(params.part || "1") === "1",
    });

    if (!partQc.pass) {
      await updateRecord(TABLES.book, bookRecordId, {
        "QC éditorial": "fail",
        "Notes QC": partQc.notes,
        "Prêt export": false,
        "Validation humaine": false,
      });
      const result = `${BOOK_EDITORIAL_VERSION}: génération ${start}-${end} refusée par le quality gate; ancienne version conservée.\n${partQc.notes}`;
      await finish(claimedJob, "Manual Review", result, generated.telemetry, partQc.notes);
      return NextResponse.json({ ok: false, processed: 1, status: "manual_review", editorial_version: BOOK_EDITORIAL_VERSION, qc: partQc }, { status: 422 });
    }

    const previous = String(chapter.fields?.["Contenu V1"] || "");
    const existing = params.replace_existing === true ? "" : previous.slice(0, MAX_EXISTING_CHARS);
    const separator = existing ? "\n\n---\n\n" : "";
    const next = `${existing}${separator}${generated.text}`;
    if (next.length > 99000) {
      const error = new Error("Chapitre proche de la limite Airtable; exporter avant d'ajouter une nouvelle partie");
      error.retryable = false;
      throw error;
    }

    const expectedChapterMontages = chapterExpectedMontages(chapter);
    const progress = bookQualityGate(next, { expectedMontages: 0, firstPart: false });
    const chapterComplete = expectedChapterMontages > 0 && progress.montageCount === expectedChapterMontages;
    let chapterQc = null;
    if (chapterComplete) {
      chapterQc = bookQualityGate(next, { expectedMontages: expectedChapterMontages, firstPart: true });
      if (!chapterQc.pass) {
        await updateRecord(TABLES.book, bookRecordId, {
          "Montages couverts": progress.montageCount,
          Caractères: next.length,
          "Marqueurs À VÉRIFIER": progress.verifyMarkers,
          "QC éditorial": "fail",
          "Notes QC": `QC global du chapitre refusé avant écriture finale.\n${chapterQc.notes}`,
          "Prêt export": false,
          "Validation humaine": false,
        });
        const result = `${BOOK_EDITORIAL_VERSION}: lot ${start}-${end} valide mais assemblage final ${progress.montageCount}/${expectedChapterMontages} refusé; version partielle précédente conservée.\n${chapterQc.notes}`;
        await finish(claimedJob, "Manual Review", result, generated.telemetry, chapterQc.notes);
        return NextResponse.json({ ok: false, processed: 1, status: "manual_review", editorial_version: BOOK_EDITORIAL_VERSION, part_qc: partQc, chapter_qc: chapterQc }, { status: 422 });
      }
    }

    const qcStatus = chapterComplete ? (chapterQc.warnings.length ? "review" : "pass") : "in_progress";
    const qcNotes = chapterComplete
      ? chapterQc.notes
      : `PROGRESS: ${progress.montageCount}/${expectedChapterMontages || "?"} montages assemblés. Dernier lot: ${partQc.notes}`;

    await updateRecord(TABLES.book, bookRecordId, {
      "Contenu V1": next,
      Version: "V2-draft",
      "Dernière génération": new Date().toISOString(),
      "Validation humaine": false,
      Statut: "Brouillon",
      "Montages couverts": progress.montageCount,
      Caractères: next.length,
      "Marqueurs À VÉRIFIER": progress.verifyMarkers,
      "QC éditorial": qcStatus,
      "Notes QC": qcNotes,
      "Prêt export": false,
    });
    const mode = params.replace_existing === true ? "remplacée" : "ajoutée";
    const summary = `${BOOK_EDITORIAL_VERSION}: partie ${start}-${end} ${mode}; lot QC=${partQc.warnings.length ? "review" : "pass"}; chapitre=${progress.montageCount}/${expectedChapterMontages || "?"} (${qcStatus}); ${generated.text.length} caractères.`;
    await finish(claimedJob, "Completed", summary, generated.telemetry, "");
    return NextResponse.json({ ok: true, processed: 1, status: "completed", editorial_version: BOOK_EDITORIAL_VERSION, chapter: bookRecordId, range: [start, end], replace_existing: params.replace_existing === true, characters: generated.text.length, part_qc: partQc, chapter_qc: chapterQc, chapter_progress: [progress.montageCount, expectedChapterMontages] });
  } catch (error) {
    const message = String(error?.message || error).slice(0, 5000);
    const retryable = error?.retryable !== false;
    if (claimedJob) {
      if (retryable) await retry(claimedJob, message).catch(() => {});
      else await finish(claimedJob, "Manual Review", message, {}, message).catch(() => {});
    }
    return NextResponse.json({ ok: false, error: message }, { status: retryable ? 503 : 422 });
  }
}
