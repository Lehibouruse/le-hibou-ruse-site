import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createRecord, getRecord, queryRecords, TABLES, updateRecord } from "../../../lib/airtable";
import { failureDisposition } from "../../../lib/agent-runtime.mjs";
import { toolsForAction, isAgenticAction, workerInstructions } from "../../../lib/agent-capabilities.mjs";
import { estimateCost, getAgentConfig, HIBOU_AGENT_INSTRUCTIONS, HIBOU_AGENT_PROMPT_VERSION, routeJob } from "../../../lib/hibou-agent.mjs";
import { verifyGithubActionsToken } from "../../../lib/github-oidc.mjs";
import { eligibleJobsFormula } from "../../../lib/job-eligibility.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LEASE_MS = 30 * 60 * 1000;
const RESPONSE_PENDING = new Set(["queued", "in_progress"]);
const MODEL_TIERS = new Set(["luna", "terra", "sol", "astra"]);
const TABLE_ALIASES = {
  cms: TABLES.cms, benchmark: TABLES.benchmark, content: TABLES.content,
  articles: TABLES.articles, products: TABLES.products, montages: TABLES.montages,
};

function actionName(job) {
  return job.fields?.action?.name || job.fields?.action || "UNKNOWN";
}

function parameters(job) {
  try { return JSON.parse(job.fields?.parameters || "{}"); } catch { return {}; }
}

function reasoningForTier(tier) {
  return tier === "luna" ? "low" : tier === "terra" ? "medium" : tier === "sol" ? "high" : "xhigh";
}

function allowedTier(requested, config, fallback) {
  let tier = MODEL_TIERS.has(String(requested || "").toLowerCase()) ? String(requested).toLowerCase() : fallback;
  if (tier === "astra" && !config.allowAstra) tier = config.allowSol ? "sol" : config.allowTerra ? "terra" : "luna";
  if (tier === "sol" && !config.allowSol) tier = config.allowTerra ? "terra" : "luna";
  if (tier === "terra" && !config.allowTerra) tier = "luna";
  return tier;
}

function responseCost(model, usage) {
  return usage ? (estimateCost(model, usage) || 0) : 0;
}

async function authenticate(request) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) throw new Error("Unauthorized");
  return verifyGithubActionsToken(auth.slice(7));
}

async function ownedJob(recordId, lockToken) {
  if (!recordId || !lockToken) throw new Error("Job ou lease absent");
  const job = await getRecord(TABLES.jobs, recordId);
  if (job.fields?.lock_token !== lockToken) throw new Error("Lease perdue");
  return job;
}

async function refreshLease(job) {
  await updateRecord(TABLES.jobs, job.id, { lease_expires_at: new Date(Date.now() + LEASE_MS).toISOString() });
}

function openAiError(response, data, label = "OpenAI Responses API") {
  const error = new Error(`${label}: ${response.status} ${data?.error?.code || "unknown"}`);
  error.httpStatus = response.status;
  return error;
}

async function claim() {
  const candidates = await queryRecords(TABLES.jobs, {
    filterByFormula: eligibleJobsFormula(process.env, { includeReserved: true }),
    sortField: "created_at", pageSize: 5,
  });
  const candidate = candidates.find((job) => isAgenticAction(actionName(job), parameters(job)));
  if (!candidate) return { ok: true, claimed: false };
  const lockToken = randomUUID();
  const now = new Date();
  await updateRecord(TABLES.jobs, candidate.id, {
    status: "Running", started_at: now.toISOString(), completed_at: null, error: "",
    lock_token: lockToken, lease_expires_at: new Date(now.getTime() + LEASE_MS).toISOString(),
  });
  const current = await getRecord(TABLES.jobs, candidate.id);
  if (current.fields?.lock_token !== lockToken) return { ok: true, claimed: false };
  const config = getAgentConfig();
  const route = routeJob(current, config);
  return {
    ok: true, claimed: true, record_id: current.id, lock_token: lockToken,
    job: { id: current.id, fields: current.fields }, action: actionName(current),
    tier: route.tier, model: config.models[route.tier], reasoning: route.reasoning,
  };
}

async function openaiStep(body) {
  const job = await ownedJob(body.record_id, body.lock_token);
  const action = actionName(job);
  if (!isAgenticAction(action, parameters(job))) throw new Error("Action agentique refusée");
  const config = getAgentConfig();
  if (!config.aiEnabled) throw new Error("IA désactivée par kill switch");
  const route = routeJob(job, config);
  const tier = allowedTier(body.model_tier, config, route.tier);
  const model = config.models[tier];
  const reasoning = reasoningForTier(tier);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model, reasoning: { effort: reasoning }, input: body.input,
      instructions: `${HIBOU_AGENT_INSTRUCTIONS}\n\n# EXECUTION BORNEE\n${workerInstructions(action)}`,
      tools: toolsForAction(action), tool_choice: "auto", parallel_tool_calls: true,
      include: ["reasoning.encrypted_content"],
      max_output_tokens: Math.max(config.maxOutputTokens, action === "UPDATE_SITE" ? 5000 : 2000),
      background: true, store: true, prompt_cache_key: "hibou-agent-worker-v1",
      metadata: { agent: HIBOU_AGENT_PROMPT_VERSION, job_id: String(job.fields.job_id).slice(0, 512), action, tier },
      text: { verbosity: "low", format: { type: "json_schema", name: "hibou_worker_result", strict: true, schema: {
        type: "object", additionalProperties: false,
        properties: { status: { type: "string", enum: ["completed", "failed", "waiting_for_human"] }, result: { type: "string" }, confidence: { type: "number", minimum: 0, maximum: 1 } },
        required: ["status", "result", "confidence"],
      } } },
    }), cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw openAiError(response, data);
  await refreshLease(job);
  return {
    ok: true, response: data, pending: RESPONSE_PENDING.has(data.status),
    estimated_cost_usd: responseCost(model, data.usage), model, tier, reasoning,
  };
}

async function openaiStepStatus(body) {
  const job = await ownedJob(body.record_id, body.lock_token);
  const responseId = String(body.response_id || "");
  if (!/^resp_[A-Za-z0-9_-]+$/.test(responseId)) throw new Error("Response ID OpenAI invalide");
  const response = await fetch(`https://api.openai.com/v1/responses/${encodeURIComponent(responseId)}`, {
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw openAiError(response, data, "OpenAI Responses retrieve");
  await refreshLease(job);
  return {
    ok: true, response: data, pending: RESPONSE_PENDING.has(data.status),
    estimated_cost_usd: responseCost(data.model, data.usage),
  };
}

async function serverTool(body) {
  const job = await ownedJob(body.record_id, body.lock_token);
  const action = actionName(job);
  const args = body.arguments || {};
  if (body.name === "airtable_read") {
    const tableId = TABLE_ALIASES[args.table];
    if (!tableId) throw new Error("Table non autorisée");
    const records = args.record_id ? [await getRecord(tableId, args.record_id)] : await queryRecords(tableId, { pageSize: Math.min(20, Number(args.limit) || 10) });
    return { ok: true, records: records.map((record) => ({ id: record.id, fields: record.fields })) };
  }
  if (body.name === "generate_image" && action === "CREATE_VIDEO") {
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.HIBOU_IMAGE_MODEL || "gpt-image-1.5", prompt: String(args.prompt).slice(0, 8000), size: "1024x1536", quality: "medium", n: 1 }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.data?.[0]?.b64_json) throw new Error(`Image API: ${response.status} ${data?.error?.code || "empty"}`);
    return { ok: true, path: args.path, base64: data.data[0].b64_json };
  }
  if (body.name === "generate_speech" && action === "CREATE_VIDEO") {
    const allowedVoices = new Set(["alloy", "ash", "ballad", "coral", "echo", "fable", "onyx", "nova", "sage", "shimmer", "verse", "marin", "cedar"]);
    const voice = allowedVoices.has(args.voice) ? args.voice : "onyx";
    const response = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.HIBOU_TTS_MODEL || "gpt-4o-mini-tts", voice, input: String(args.text).slice(0, 4096), response_format: "mp3", instructions: "Voix française profonde, posée, premium, intelligible." }),
    });
    if (!response.ok) throw new Error(`Speech API: ${response.status}`);
    return { ok: true, path: args.path, base64: Buffer.from(await response.arrayBuffer()).toString("base64") };
  }
  if (body.name === "register_video_draft" && action === "CREATE_VIDEO") {
    const expectedRecord = parameters(job).content_record_id;
    if (!expectedRecord || args.record_id !== expectedRecord) throw new Error("Fiche Content Pipeline hors périmètre");
    if (!/^public\/generated\/[a-zA-Z0-9._/-]+\.mp4$/.test(args.video_path) || args.video_path.includes("..")) throw new Error("Chemin vidéo refusé");
    if (!(/^[a-f0-9]{40}$/.test(args.branch) || /^hibou-agent\/[a-zA-Z0-9._/-]+$/.test(args.branch)) || args.branch.includes("..")) throw new Error("Référence Git refusée");
    const rawUrl = `https://raw.githubusercontent.com/Lehibouruse/le-hibou-ruse-site/${args.branch}/${args.video_path}`;
    await updateRecord(TABLES.content, args.record_id, {
      "Vidéo finale": [{ url: rawUrl }],
      "Statut": "Validation humaine",
      "Validation humaine": false,
      "Statut publication": "À valider par Marc — aucune publication autorisée",
      "Journal automatisation": String(args.notes || "Brouillon autonome généré").slice(0, 5000),
      "Erreur pipeline": "",
    });
    return { ok: true, url: rawUrl, publication_authorization: false, waiting_for: "Marc" };
  }
  throw new Error("Outil serveur refusé");
}

async function checkpoint(body) {
  const job = await ownedJob(body.record_id, body.lock_token);
  const telemetry = body.telemetry || {};
  const tool = String(body.tool || "").slice(0, 100);
  const phase = String(body.phase || "progress").slice(0, 40);
  const ok = body.ok !== false;
  await updateRecord(TABLES.jobs, job.id, {
    agent_status: `${phase}:${tool || `step-${Number(body.step || 0)}`}:${ok ? "ok" : "failed"}`,
    model_used: telemetry.model || "", reasoning_effort: telemetry.reasoning || "",
    input_tokens: Number(telemetry.input_tokens || 0), cached_input_tokens: Number(telemetry.cached_input_tokens || 0),
    output_tokens: Number(telemetry.output_tokens || 0), estimated_cost_usd: Number(telemetry.cost || 0),
    ai_calls: Number(telemetry.ai_calls || 0), response_ids: (telemetry.response_ids || []).join("\n"),
    lease_expires_at: new Date(Date.now() + LEASE_MS).toISOString(),
  });
  if (phase === "tool") {
    await createRecord(TABLES.journal, {
      Workflow: "HIBOU_AGENT_V1 — tool checkpoint",
      Déclencheur: "GitHub Actions OIDC",
      Action: `${actionName(job)} · ${job.fields?.job_id || job.id} · ${tool} · ${ok ? "OK" : "FAILED"}`,
      Erreur: ok ? "" : String(body.error || "Erreur outil").slice(0, 5000),
      Notes: JSON.stringify({ executed_at: new Date().toISOString(), step: Number(body.step || 0), model: telemetry.model || "", ai_calls: Number(telemetry.ai_calls || 0), cost_usd: Number(telemetry.cost || 0) }),
    });
  }
  return { ok: true };
}

async function finalize(body) {
  const job = await ownedJob(body.record_id, body.lock_token);
  const outcome = body.outcome || {};
  const now = Date.now();
  const terminal = outcome.status === "completed"
    ? { status: "Completed", completed_at: new Date(now).toISOString(), next_run_at: null, retry_count: Number(job.fields?.retry_count || 0) }
    : outcome.status === "waiting_for_human"
      ? { status: "Manual Review", completed_at: new Date(now).toISOString(), next_run_at: null, retry_count: Number(job.fields?.retry_count || 0) }
      : failureDisposition(job.fields, now);
  const status = terminal.status;
  const telemetry = body.telemetry || {};
  await updateRecord(TABLES.jobs, job.id, {
    ...terminal,
    result: String(outcome.result || "").slice(0, 100000), error: ["Error", "Retry"].includes(status) ? String(outcome.result || "").slice(0, 5000) : "",
    agent_status: outcome.status || "failed", model_used: telemetry.model || "",
    reasoning_effort: telemetry.reasoning || "", input_tokens: Number(telemetry.input_tokens || 0),
    cached_input_tokens: Number(telemetry.cached_input_tokens || 0), output_tokens: Number(telemetry.output_tokens || 0),
    estimated_cost_usd: Number(telemetry.cost || 0), ai_calls: Number(telemetry.ai_calls || 0),
    response_ids: (telemetry.response_ids || []).join("\n"), external_id: String(body.external_id || "").slice(0, 1000),
    lock_token: "", lease_expires_at: null,
  });
  await createRecord(TABLES.journal, {
    Workflow: "HIBOU_AGENT_V1 — GitHub worker",
    Déclencheur: "GitHub Actions OIDC",
    Action: `${actionName(job)} · ${job.fields?.job_id || job.id} · ${status}`,
    "URL résultat": String(body.external_id || "").startsWith("http") ? String(body.external_id).slice(0, 1000) : "",
    Erreur: ["Error", "Retry"].includes(status) ? String(outcome.result || "").slice(0, 5000) : "",
    Notes: JSON.stringify({ executed_at: new Date(now).toISOString(), model: telemetry.model || "", reasoning: telemetry.reasoning || "", ai_calls: Number(telemetry.ai_calls || 0), cost_usd: Number(telemetry.cost || 0), retry_count: terminal.retry_count, next_run_at: terminal.next_run_at, external_id: String(body.external_id || "").slice(0, 1000), result: String(outcome.result || "").slice(0, 3000) }),
  }).catch((error) => console.error("Agent worker journal write failed", error?.message || error));
  return { ok: true, status };
}

export async function POST(request) {
  try {
    await authenticate(request);
    const body = await request.json();
    const result = body.operation === "claim" ? await claim()
      : body.operation === "step" ? await openaiStep(body)
        : body.operation === "step_status" ? await openaiStepStatus(body)
          : body.operation === "tool" ? await serverTool(body)
            : body.operation === "checkpoint" ? await checkpoint(body)
              : body.operation === "finalize" ? await finalize(body)
                : (() => { throw new Error("Opération inconnue"); })();
    return NextResponse.json(result);
  } catch (error) {
    const upstream = Number(error?.httpStatus || 0);
    const status = error?.message === "Unauthorized" ? 401 : upstream === 429 || upstream >= 500 ? 503 : 400;
    return NextResponse.json({ ok: false, error: String(error?.message || error).slice(0, 500) }, { status });
  }
}
