import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createRecord, getRecord, queryRecords, TABLES, updateRecord } from "../../../lib/airtable";
import { eligibleJobsFormula } from "../../../lib/job-eligibility.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const LEASE_MS = 5 * 60 * 1000;
const MAX_SOURCE_RECORDS = 24;
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
    status: "Running", started_at: now.toISOString(), completed_at: null, error: "",
    lock_token: lockToken, lease_expires_at: new Date(now.getTime() + LEASE_MS).toISOString(),
  });
  const current = await getRecord(TABLES.jobs, job.id);
  const status = current?.fields?.status?.name || current?.fields?.status;
  return current?.fields?.lock_token === lockToken && status === "Running" ? { ...current, lockToken } : null;
}

async function owns(job) {
  const current = await getRecord(TABLES.jobs, job.id);
  return current?.fields?.lock_token === job.lockToken;
}

async function finish(job, status, result, telemetry = {}, error = "") {
  if (!(await owns(job))) return false;
  await updateRecord(TABLES.jobs, job.id, {
    status,
    completed_at: ["Completed", "Manual Review", "Error"].includes(status) ? new Date().toISOString() : null,
    result: String(result || "").slice(0, 100000),
    error: String(error || "").slice(0, 5000),
    agent_status: status === "Completed" ? "completed" : status === "Retry" ? "needs_escalation" : "waiting_for_human",
    model_used: telemetry.model || "",
    reasoning_effort: telemetry.reasoning || "",
    input_tokens: Number(telemetry.input_tokens || 0),
    cached_input_tokens: Number(telemetry.cached_input_tokens || 0),
    output_tokens: Number(telemetry.output_tokens || 0),
    estimated_cost_usd: Number(telemetry.cost || 0),
    ai_calls: Number(telemetry.ai_calls || 0),
    response_ids: telemetry.response_id || "",
    lock_token: "", lease_expires_at: null,
  });
  await createRecord(TABLES.journal, {
    Workflow: "HIBOU_BOOK_SCHEDULER_V1",
    Déclencheur: job.fields?.requested_by || "Jobs",
    Action: `CREATE_BOOK · ${job.fields?.job_id || job.id} · ${status}`,
    "Dernière exécution": new Date().toISOString(),
    Erreur: String(error || "").slice(0, 5000),
    Notes: String(result || "").slice(0, 10000),
  }).catch(() => {});
  return true;
}

async function retry(job, message) {
  if (!(await owns(job))) return false;
  const count = Number(job.fields?.retry_count || 0) + 1;
  const max = Math.min(2, Number(job.fields?.max_retries ?? 2));
  if (count > max) return finish(job, "Manual Review", message, {}, message);
  await updateRecord(TABLES.jobs, job.id, {
    status: "Retry", retry_count: count,
    next_run_at: new Date(Date.now() + Math.min(15 * 60_000, 60_000 * 2 ** count)).toISOString(),
    error: String(message).slice(0, 5000), agent_status: "needs_escalation",
    lock_token: "", lease_expires_at: null,
  });
  return true;
}

function outputText(response) {
  if (typeof response.output_text === "string") return response.output_text;
  return (response.output || []).flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text).join("");
}

function safeSource(records) {
  return records.map((record) => ({
    id: record.id,
    fields: Object.fromEntries(Object.entries(record.fields || {})
      .filter(([key]) => key !== "Original verbatim")
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
  const input = Number(usage.input_tokens || 0);
  const cached = Math.min(input, Number(usage.input_tokens_details?.cached_tokens || 0));
  const output = Number(usage.output_tokens || 0);
  return ((input - cached) * p.input + cached * p.cached + output * p.output) / 1_000_000;
}

async function generatePart({ chapter, source, params }) {
  const model = ["gpt-5.6-sol", "gpt-5.6-terra"].includes(params.model) ? params.model : "gpt-5.6-sol";
  const instructions = `Tu écris la V1 du livre Le Hibou Rusé en français. Le style doit être très lisible, narratif, premium, parfois provocateur et accrocheur, mais le fond doit rester honnête. Pour chaque montage fourni : 1) ouvre par une micro-histoire fictive courte et mémorable, sans personne réelle ; 2) explique le mécanisme ; 3) explique le fondement et les conditions ; 4) donne l'intérêt économique quand il est étayé ; 5) détaille les risques juridiques, fiscaux et pratiques ; 6) indique ce qui doit être vérifié ; 7) termine par la variante robuste. N'invente jamais un texte, un taux, une jurisprudence ou une condition. Quand la source est incertaine, écris [À VÉRIFIER]. Les montages D6, frauduleux, fictifs, reposant sur fausse déclaration, fausse résidence, faux salarié, fausse facture, détournement d'aide, dissimulation ou abus manifeste ne doivent jamais devenir des tutoriels : raconte le scénario de façon non opérationnelle, explique pourquoi il franchit la ligne rouge, les indices de détection, les risques et l'alternative légale. Ne donne pas d'étapes permettant de commettre ou dissimuler une fraude. Structure avec titres Markdown. Le résultat doit pouvoir être relu tel quel comme un vrai chapitre de livre.`;
  const input = JSON.stringify({
    chapitre: chapter.fields?.Chapitre || "",
    section: chapter.fields?.Section || "",
    notes_editoriales: chapter.fields?.Notes || "",
    plage_sources: `${params.source_start}-${params.source_end}`,
    objectif_mots_partie: Number(params.target_words || 3500),
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
      max_output_tokens: Math.min(10000, Math.max(2500, Number(params.max_output_tokens || 7000))),
      store: false,
      prompt_cache_key: "hibou-book-v1",
      text: { verbosity: "medium" },
      metadata: { project: "le-hibou-ruse", purpose: "book-v1", chapter_record: chapter.id },
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
  if (!text) throw new Error("OpenAI book: réponse vide");
  return {
    text,
    telemetry: {
      model: data.model || model,
      reasoning: model === "gpt-5.6-sol" ? "high" : "medium",
      input_tokens: Number(data.usage?.input_tokens || 0),
      cached_input_tokens: Number(data.usage?.input_tokens_details?.cached_tokens || 0),
      output_tokens: Number(data.usage?.output_tokens || 0),
      cost: usageCost(data.model || model, data.usage), ai_calls: 1, response_id: data.id || "",
    },
  };
}

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  try {
    const eligible = eligibleJobsFormula(process.env);
    const candidates = await queryRecords(TABLES.jobs, {
      filterByFormula: `AND(${eligible},{action}='CREATE_BOOK')`,
      sortField: "created_at", pageSize: 5,
    });
    const candidate = candidates.find((job) => actionName(job) === "CREATE_BOOK");
    if (!candidate) return NextResponse.json({ ok: true, processed: 0, reason: "no_create_book" });
    const job = await claim(candidate);
    if (!job) return NextResponse.json({ ok: true, processed: 0, reason: "lease_not_acquired" });
    const params = parameters(job);
    const bookRecordId = String(params.book_record_id || "");
    const start = Number(params.source_start);
    const end = Number(params.source_end);
    if (!/^rec[A-Za-z0-9]{14}$/.test(bookRecordId) || !Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start || end - start + 1 > MAX_SOURCE_RECORDS) {
      const message = `CREATE_BOOK invalide: book_record_id rec..., source_start/end requis, maximum ${MAX_SOURCE_RECORDS} montages par Job`;
      await finish(job, "Manual Review", message, {}, message);
      return NextResponse.json({ ok: false, processed: 1, error: message }, { status: 422 });
    }
    const chapter = await getRecord(TABLES.book, bookRecordId);
    const source = await queryRecords(TABLES.montages, {
      filterByFormula: `AND({Numéro source}>=${start},{Numéro source}<=${end})`,
      sortField: "Numéro source", pageSize: MAX_SOURCE_RECORDS,
      priorityAware: false,
    });
    if (!source.length) throw new Error(`Aucun montage trouvé pour ${start}-${end}`);
    const generated = await generatePart({ chapter, source, params });
    const existing = String(chapter.fields?.["Contenu V1"] || "");
    const separator = existing ? "\n\n---\n\n" : "";
    const heading = `## Partie ${params.part || ""} — Montages ${start} à ${end}`.replace("Partie  —", "Partie —");
    const next = `${existing.slice(0, MAX_EXISTING_CHARS)}${separator}${heading}\n\n${generated.text}`;
    if (next.length > 99000) throw new Error("Chapitre proche de la limite Airtable; exporter avant d'ajouter une nouvelle partie");
    await updateRecord(TABLES.book, bookRecordId, {
      "Contenu V1": next,
      Version: "V1",
      "Dernière génération": new Date().toISOString(),
      "Validation humaine": false,
      Statut: "Brouillon",
    });
    const summary = `Partie ${start}-${end} générée dans ${chapter.fields?.Chapitre || bookRecordId}; ${source.length} montages; ${generated.text.length} caractères.`;
    await finish(job, "Completed", summary, generated.telemetry, "");
    return NextResponse.json({ ok: true, processed: 1, status: "completed", chapter: bookRecordId, range: [start, end], characters: generated.text.length });
  } catch (error) {
    const message = String(error?.message || error).slice(0, 5000);
    const retryable = error?.retryable !== false;
    const eligible = await queryRecords(TABLES.jobs, {
      filterByFormula: `AND(${eligibleJobsFormula(process.env)},{action}='CREATE_BOOK')`, sortField: "created_at", pageSize: 1,
    }).catch(() => []);
    const current = eligible[0];
    if (current && retryable) await retry({ ...current, lockToken: current.fields?.lock_token }, message).catch(() => {});
    return NextResponse.json({ ok: false, error: message }, { status: retryable ? 503 : 422 });
  }
}
