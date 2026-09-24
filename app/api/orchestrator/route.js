import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createRecord, getRecord, queryRecords, TABLES, updateRecord } from "../../../lib/airtable";
import {
  getAgentConfig,
  HIBOU_AGENT_PROMPT_VERSION,
  routeJob,
  runAgentJob,
} from "../../../lib/hibou-agent.mjs";
import { eligibleJobsFormula } from "../../../lib/job-eligibility.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LEASE_MS = 5 * 60 * 1000;
const waitSeconds = (retry) => Math.min(3600, 60 * 2 ** retry);

class TerminalJobError extends Error {
  constructor(message, status = "failed") {
    super(message);
    this.agentStatus = status;
    this.retryable = false;
  }
}

function actionName(job) {
  return job.fields.action?.name || job.fields.action || "UNKNOWN";
}

function parseParameters(job) {
  try {
    return JSON.parse(job.fields.parameters || "{}");
  } catch {
    throw new TerminalJobError("parameters doit contenir un JSON valide");
  }
}

async function safeLog(job, status, message, started, details = {}) {
  try {
    await createRecord(TABLES.journal, {
      Workflow: "Hibou Orchestrator",
      Déclencheur: job.fields.requested_by || "Jobs",
      Action: actionName(job),
      Statut: status,
      "Dernière exécution": new Date().toISOString(),
      "ID externe": details.externalId || "",
      Erreur: status === "Completed" ? "" : String(message || "").slice(0, 5000),
      Notes: [
        `job=${job.fields.job_id}`,
        `agent=${HIBOU_AGENT_PROMPT_VERSION}`,
        `agent_status=${details.agentStatus || "not_used"}`,
        `model=${details.model || "none"}`,
        `reasoning=${details.reasoning || "none"}`,
        `input_tokens=${details.inputTokens || 0}`,
        `cached_input_tokens=${details.cachedInputTokens || 0}`,
        `output_tokens=${details.outputTokens || 0}`,
        `estimated_cost_usd=${Number(details.cost || 0).toFixed(6)}`,
        `ai_calls=${details.aiCalls || 0}`,
        `escalations=${details.escalations || 0}`,
        `durée_ms=${Date.now() - started}`,
        String(message || "").slice(0, 2000),
      ].join("; "),
    });
  } catch (error) {
    console.error("Orchestrator journal write failed", error?.message || error);
  }
}

async function runDeterministicAction(job) {
  const action = actionName(job);
  const parameters = parseParameters(job);

  if (action === "UPDATE_CHECKOUT") {
    const records = await queryRecords(TABLES.configuration, { filterByFormula: "{Clé}='checkout_url'", pageSize: 1 });
    if (!records[0]) throw new TerminalJobError("Configuration checkout_url introuvable");
    const url = String(parameters.checkout_url || "");
    if (url && !url.startsWith("https://")) throw new TerminalJobError("checkout_url doit utiliser HTTPS");
    await updateRecord(TABLES.configuration, records[0].id, {
      Valeur: url,
      Statut: url ? "Actif" : "En attente",
      Erreur: url ? "" : "Checkout non configuré",
    });
    return { result: "Checkout central mis à jour" };
  }

  if (action === "UPDATE_SITE") {
    if (!parameters.key) throw new TerminalJobError("parameters.key requis");
    const key = String(parameters.key).replaceAll("'", "\\'");
    const records = await queryRecords(TABLES.cms, { filterByFormula: `{Clé}='${key}'`, pageSize: 1 });
    if (!records[0]) throw new TerminalJobError(`Bloc CMS introuvable: ${parameters.key}`);
    const allowed = ["Titre", "Sous-titre", "Contenu", "CTA texte", "CTA URL", "Image URL", "Publié"];
    const fields = Object.fromEntries(Object.entries(parameters.fields || {}).filter(([field]) => allowed.includes(field)));
    if (!Object.keys(fields).length) throw new TerminalJobError("Aucun champ CMS autorisé fourni");
    await updateRecord(TABLES.cms, records[0].id, fields);
    return { result: `Bloc ${parameters.key} mis à jour` };
  }

  if (action === "CREATE_ARTICLE") {
    const article = parameters.article || {};
    if (!article.Titre || !article.Slug || !article.Résumé || !article.Contenu) {
      throw new TerminalJobError("Titre, Slug, Résumé et Contenu requis");
    }
    const slug = String(article.Slug).replaceAll("'", "\\'");
    const existing = await queryRecords(TABLES.articles, { filterByFormula: `{Slug}='${slug}'`, pageSize: 1 });
    if (existing[0]) return { result: "Article déjà présent (dédupliqué)", externalId: existing[0].id };
    const created = await createRecord(TABLES.articles, { ...article, Publié: false });
    return { result: "Brouillon d’article créé", externalId: created.records?.[0]?.id || "" };
  }

  if (action === "PUBLISH_ARTICLE") {
    const slugValue = parameters.slug || job.fields.target;
    const slug = String(slugValue || "").replaceAll("'", "\\'");
    if (!slug) throw new TerminalJobError("slug requis");
    const records = await queryRecords(TABLES.articles, { filterByFormula: `{Slug}='${slug}'`, pageSize: 1 });
    if (!records[0]) throw new TerminalJobError(`Article introuvable: ${slugValue}`);
    await updateRecord(TABLES.articles, records[0].id, { Publié: true, "Date publication": new Date().toISOString() });
    return { result: "Article publié", externalId: records[0].id };
  }

  if (action === "HEALTH_CHECK") {
    const [jobs, journal] = await Promise.all([
      queryRecords(TABLES.jobs, { sortField: "created_at", sortDirection: "desc", pageSize: 1 }),
      queryRecords(TABLES.journal, { pageSize: 1 }),
    ]);
    return { result: JSON.stringify({ airtable: "ok", jobs: jobs.length, journal: journal.length, openai_calls: 0 }) };
  }

  throw new TerminalJobError(`Action non branchée sans outil externe: ${action}`, "waiting_for_human");
}

async function claimJob(job) {
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

  await new Promise((resolve) => setTimeout(resolve, 250));
  const claimed = await getRecord(TABLES.jobs, job.id);
  const status = claimed.fields?.status?.name || claimed.fields?.status;
  if (claimed.fields?.lock_token !== lockToken || status !== "Running") return null;
  return { ...claimed, lockToken };
}

async function stillOwnsLease(job) {
  const current = await getRecord(TABLES.jobs, job.id);
  return current.fields?.lock_token === job.lockToken;
}

async function dailyAiSpend() {
  const records = await queryRecords(TABLES.jobs, {
    filterByFormula: "AND({created_at}>=TODAY(),{estimated_cost_usd}>0)",
    pageSize: 100,
  });
  return records.reduce((sum, record) => sum + Number(record.fields.estimated_cost_usd || 0), 0);
}

function telemetryFields(agentStatus, telemetry = {}) {
  return {
    agent_status: agentStatus,
    model_used: telemetry.model || "",
    reasoning_effort: telemetry.reasoning || "",
    input_tokens: Number(telemetry.usage?.input_tokens || 0),
    cached_input_tokens: Number(telemetry.usage?.cached_input_tokens || 0),
    output_tokens: Number(telemetry.usage?.output_tokens || 0),
    estimated_cost_usd: Number(telemetry.cost || 0),
    ai_calls: Number(telemetry.ai_calls || 0),
    escalations: Number(telemetry.escalations || 0),
    response_ids: (telemetry.responseIds || []).filter(Boolean).join("\n"),
  };
}

function journalDetails(agentStatus, telemetry = {}, externalId = "") {
  return {
    agentStatus,
    externalId,
    model: telemetry.model,
    reasoning: telemetry.reasoning,
    inputTokens: telemetry.usage?.input_tokens,
    cachedInputTokens: telemetry.usage?.cached_input_tokens,
    outputTokens: telemetry.usage?.output_tokens,
    cost: telemetry.cost,
    aiCalls: telemetry.ai_calls,
    escalations: telemetry.escalations,
  };
}

async function finalize(job, status, agentStatus, result, started, telemetry = {}, externalId = "") {
  if (!(await stillOwnsLease(job))) return { lostLease: true };
  await updateRecord(TABLES.jobs, job.id, {
    status,
    completed_at: new Date().toISOString(),
    next_run_at: null,
    result: typeof result === "string" ? result : JSON.stringify(result),
    external_id: externalId,
    error: status === "Error" ? String(result).slice(0, 5000) : "",
    lock_token: "",
    lease_expires_at: null,
    ...telemetryFields(agentStatus, telemetry),
  });
  await safeLog(job, status, typeof result === "string" ? result : JSON.stringify(result), started, journalDetails(agentStatus, telemetry, externalId));
  return { lostLease: false };
}

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const candidates = await queryRecords(TABLES.jobs, {
    filterByFormula: eligibleJobsFormula(),
    sortField: "created_at",
    pageSize: 1,
  });
  if (!candidates[0]) {
    return NextResponse.json({ ok: true, processed: 0, openai_calls: 0, reason: "no_eligible_job" });
  }

  const claimed = await claimJob(candidates[0]);
  if (!claimed) return NextResponse.json({ ok: true, processed: 0, openai_calls: 0, reason: "lease_not_acquired" });
  const job = claimed;
  const started = Date.now();

  try {
    const idempotencyKey = job.fields.idempotency_key;
    if (idempotencyKey) {
      const safeKey = String(idempotencyKey).replaceAll("'", "\\'");
      const completed = await queryRecords(TABLES.jobs, {
        filterByFormula: `AND({idempotency_key}='${safeKey}',{status}='Completed')`,
        pageSize: 2,
      });
      if (completed.some((record) => record.id !== job.id)) {
        const result = "Action déjà exécutée (dédupliquée).";
        await finalize(job, "Completed", "completed", result, started);
        return NextResponse.json({ ok: true, processed: 1, deduplicated: true, openai_calls: 0 });
      }
    }

    const route = routeJob(job, getAgentConfig());
    if (route.kind === "waiting_for_human") {
      await finalize(job, "Manual Review", "waiting_for_human", route.reason, started);
      return NextResponse.json({ ok: false, processed: 1, job_id: job.fields.job_id, status: "waiting_for_human", openai_calls: 0 });
    }

    if (route.kind === "deterministic") {
      const outcome = await runDeterministicAction(job);
      await finalize(job, "Completed", "completed", outcome.result, started, {}, outcome.externalId || "");
      return NextResponse.json({ ok: true, processed: 1, job_id: job.fields.job_id, status: "completed", openai_calls: 0 });
    }

    if (PAID_AI_DISABLED_BY_POLICY) {
      const result = "OpenAI API désactivée par politique projet ; utiliser ChatGPT actuel ou un traitement déterministe/local.";
      await finalize(job, "Manual Review", "waiting_for_human", result, started);
      return NextResponse.json({ ok: false, processed: 1, job_id: job.fields.job_id, status: "waiting_for_human", openai_calls: 0, reason: "paid_ai_disabled_by_policy" });
    }

    const spend = await dailyAiSpend();
    const telemetry = await runAgentJob({
      job,
      route,
      dailySpendUsd: spend,
      priorTelemetry: {
        input_tokens: job.fields.input_tokens,
        cached_input_tokens: job.fields.cached_input_tokens,
        output_tokens: job.fields.output_tokens,
        cost: job.fields.estimated_cost_usd,
        ai_calls: job.fields.ai_calls,
        escalations: job.fields.escalations,
        responseIds: String(job.fields.response_ids || "").split("\n").filter(Boolean),
      },
    });
    const machineResult = {
      status: telemetry.status,
      result: telemetry.result,
      escalation_reason: telemetry.escalation_reason || "",
      confidence: telemetry.confidence ?? null,
      prompt_version: HIBOU_AGENT_PROMPT_VERSION,
    };

    if (telemetry.status === "completed") {
      await finalize(job, "Completed", "completed", machineResult, started, telemetry);
      return NextResponse.json({ ok: true, processed: 1, job_id: job.fields.job_id, status: "completed", openai_calls: telemetry.ai_calls });
    }
    if (telemetry.status === "waiting_for_human" || telemetry.status === "needs_escalation") {
      await finalize(job, "Manual Review", telemetry.status, machineResult, started, telemetry);
      return NextResponse.json({ ok: false, processed: 1, job_id: job.fields.job_id, status: telemetry.status, openai_calls: telemetry.ai_calls });
    }

    await finalize(job, "Error", "failed", machineResult, started, telemetry);
    return NextResponse.json({ ok: false, processed: 1, job_id: job.fields.job_id, status: "failed", openai_calls: telemetry.ai_calls }, { status: 422 });
  } catch (error) {
    const retry = Number(job.fields.retry_count || 0) + 1;
    const configuredMax = Math.min(2, Number(job.fields.max_retries ?? 2));
    const terminal = error.retryable === false || retry > configuredMax;
    const agentStatus = error.agentStatus || (terminal ? "failed" : "needs_escalation");
    const status = terminal ? (agentStatus === "waiting_for_human" || job.fields.requires_review ? "Manual Review" : "Error") : "Retry";
    const nextRun = terminal ? null : new Date(Date.now() + waitSeconds(retry) * 1000).toISOString();
    const message = String(error?.message || error).slice(0, 5000);
    const telemetry = error.telemetry || {};

    if (await stillOwnsLease(job)) {
      await updateRecord(TABLES.jobs, job.id, {
        status,
        retry_count: retry,
        next_run_at: nextRun,
        completed_at: terminal ? new Date().toISOString() : null,
        error: message,
        agent_status: agentStatus,
        lock_token: "",
        lease_expires_at: null,
        ...telemetryFields(agentStatus, telemetry),
      });
    }
    await safeLog(job, status, message, started, journalDetails(agentStatus, telemetry));
    return NextResponse.json(
      { ok: false, processed: 1, job_id: job.fields.job_id, status: agentStatus, retry_count: retry, openai_calls: telemetry.ai_calls || 0 },
      { status: terminal ? 422 : 503 },
    );
  }
}
