import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createRecord, getRecord, queryRecords, TABLES, updateRecord } from "../../../lib/airtable";
import { failureDisposition } from "../../../lib/agent-runtime.mjs";
import { toolsForAction, isAgenticAction, workerInstructions } from "../../../lib/agent-capabilities.mjs";
import { estimateCost, getAgentConfig, HIBOU_AGENT_INSTRUCTIONS, HIBOU_AGENT_PROMPT_VERSION, routeJob } from "../../../lib/hibou-agent.mjs";
import { verifyGithubActionsToken } from "../../../lib/github-oidc.mjs";
import { eligibleJobsFormula } from "../../../lib/job-eligibility.mjs";
import { creditPausePatch, isCreditExhausted, openOpenAiCircuit, readOpenAiCircuit } from "../../../lib/openai-circuit.mjs";
import { dispatchSocialPost, socialGatewayStatus } from "../../../lib/social-gateway.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LEASE_MS = 30 * 60 * 1000;
const RESPONSE_PENDING = new Set(["queued", "in_progress"]);
const MODEL_TIERS = new Set(["luna", "terra", "sol", "astra"]);
const TABLE_ALIASES = {
  cms: TABLES.cms, benchmark: TABLES.benchmark, content: TABLES.content,
  articles: TABLES.articles, products: TABLES.products, montages: TABLES.montages,
  video_scenes: TABLES.videoScenes, video_profiles: TABLES.videoProfiles,
};

function actionName(job) {
  return job.fields?.action?.name || job.fields?.action || "UNKNOWN";
}

function parameters(job) {
  try { return JSON.parse(job.fields?.parameters || "{}"); } catch { return {}; }
}

function bool(value, fallback = false) {
  if (value === true || value === false) return value;
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["true", "1", "yes", "oui"].includes(normalized)) return true;
  if (["false", "0", "no", "non"].includes(normalized)) return false;
  return fallback;
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

function responseOutputText(data) {
  if (data?.output_text) return data.output_text;
  return (data?.output || []).flatMap((item) => item.content || [])
    .filter((item) => item.type === "output_text")
    .map((item) => item.text)
    .join("");
}

function videoAction(action) {
  return action === "CREATE_VIDEO" || action === "REGENERATE_SCENE";
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
  const circuit = await readOpenAiCircuit();
  if (circuit.active) {
    return {
      ok: true,
      claimed: false,
      reason: "openai_credit_circuit_open",
      circuit: { active: true, until: circuit.until, reason: circuit.reason },
    };
  }
  const candidates = await queryRecords(TABLES.jobs, {
    filterByFormula: eligibleJobsFormula(process.env, { includeReserved: true }),
    sortField: "created_at", pageSize: 10,
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

async function socialPolicySnapshot() {
  const records = await queryRecords(TABLES.configuration, { pageSize: 100 });
  const config = Object.fromEntries(records.map((record) => [record.fields?.Clé, record.fields?.Valeur]));
  return {
    gateway_enabled: bool(config.social_gateway_enabled, true),
    test_mode: bool(config.social_test_mode, true),
    review_required: bool(config.social_publication_requires_review, true),
    first_videos_review_count: Number(config.human_review_first_videos || 10),
  };
}

async function serverTool(body) {
  const job = await ownedJob(body.record_id, body.lock_token);
  const action = actionName(job);
  const args = body.arguments || {};
  if (body.name === "airtable_read") {
    const tableId = TABLE_ALIASES[args.table];
    if (!tableId) throw new Error("Table non autorisée");
    const records = args.record_id ? [await getRecord(tableId, args.record_id)] : await queryRecords(tableId, { pageSize: Math.min(50, Number(args.limit) || 10) });
    return { ok: true, records: records.map((record) => ({ id: record.id, fields: record.fields })) };
  }
  if (body.name === "scene_save" && videoAction(action)) {
    const expectedRecord = parameters(job).content_record_id;
    if (!expectedRecord) throw new Error("content_record_id requis pour une scène vidéo");
    const scene = JSON.parse(String(args.scene_json || "{}"));
    const order = Math.max(1, Math.min(99, Number(scene.order || 1)));
    const sceneKey = String(scene.scene_key || `${expectedRecord}_scene_${String(order).padStart(2, "0")}`).slice(0, 180);
    const statusAllowed = new Set(["À planifier", "Prompt prêt", "Génération", "QC visuel", "À régénérer", "Image validée", "Montée", "Erreur"]);
    const shotTypes = new Set(["gros plan", "plan moyen", "plan large", "schéma", "split-screen", "macro", "scène narrative"]);
    const anchors = new Set(["centre", "gauche", "droite", "haut", "bas"]);
    const shotType = shotTypes.has(String(scene.shot_type || "")) ? String(scene.shot_type) : "scène narrative";
    const anchor = anchors.has(String(scene.anchor || "")) ? String(scene.anchor) : "centre";
    const fields = {
      "Scène": sceneKey,
      "Vidéo": [expectedRecord],
      "Job lié": [job.id],
      "Ordre": order,
      "Narration": String(scene.narration || "").slice(0, 10000),
      "Idée visuelle": String(scene.visual_concept || "").slice(0, 10000),
      "Prompt image": String(scene.prompt || "").slice(0, 20000),
      "Texte écran": String(scene.screen_text || "").slice(0, 180),
      "Hibou": scene.owl === true,
      "Type de plan": shotType,
      "Durée secondes": Math.max(1, Math.min(15, Number(scene.duration_seconds || 2))),
      "Zoom %": Math.max(0, Math.min(6, Number(scene.zoom_percent || 3))),
      "Ancrage": anchor,
      "Cue musique": String(scene.music_cue || "").slice(0, 5000),
      "Candidats JSON": JSON.stringify({ candidates: Array.isArray(scene.candidates) ? scene.candidates.slice(0, 6) : [], selected_path: String(scene.selected_path || "") }).slice(0, 90000),
      "Score QC image": Math.max(0, Math.min(100, Number(scene.qc_score || 0))),
      "Motif QC": String(scene.qc_reason || "").slice(0, 10000),
      "Régénérations": Math.max(0, Math.min(10, Number(scene.regenerations || 0))),
      "Statut": statusAllowed.has(scene.status) ? scene.status : "À planifier",
      "Erreur": String(scene.error || "").slice(0, 10000),
    };
    if (/^rec[A-Za-z0-9]{14}$/.test(String(scene.profile_record_id || ""))) fields["Profil vidéo"] = [scene.profile_record_id];
    let recordId = /^rec[A-Za-z0-9]{14}$/.test(String(scene.record_id || "")) ? scene.record_id : "";
    if (!recordId) {
      const escaped = sceneKey.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
      const existing = await queryRecords(TABLES.videoScenes, { filterByFormula: `{Scène}="${escaped}"`, pageSize: 1 });
      recordId = existing[0]?.id || "";
    }
    const saved = recordId ? await updateRecord(TABLES.videoScenes, recordId, fields) : await createRecord(TABLES.videoScenes, fields);
    const savedId = recordId || saved?.records?.[0]?.id || "";
    return { ok: true, record_id: savedId, scene_key: sceneKey, status: fields["Statut"] };
  }
  if (body.name === "video_state" && videoAction(action)) {
    const expectedRecord = parameters(job).content_record_id;
    if (!expectedRecord) throw new Error("content_record_id requis");
    const allowed = new Set(["PLANNING", "GENERATING", "VISUAL_QC", "RENDERING", "FINAL_QC", "HUMAN_REVIEW", "READY", "ERROR"]);
    const state = allowed.has(String(args.state)) ? String(args.state) : "ERROR";
    const patch = {
      "État production vidéo": state,
      "Version pipeline vidéo": "2.0",
      "Journal automatisation": String(args.notes || "").slice(0, 5000),
    };
    if (state === "PLANNING") {
      const profiles = await queryRecords(TABLES.videoProfiles, { filterByFormula: '{Profil}="HIBOU_VIRAL_V1"', pageSize: 1 }).catch(() => []);
      if (profiles[0]?.id) patch["Profil vidéo"] = [profiles[0].id];
    }
    await updateRecord(TABLES.content, expectedRecord, patch);
    return { ok: true, state };
  }
  if (body.name === "visual_qc" && videoAction(action)) {
    const image = args.image || {};
    const base64 = String(image.base64 || "");
    if (!base64 || base64.length > 5500000) throw new Error("Aperçu image QC absent ou trop volumineux");
    const config = getAgentConfig();
    const model = process.env.HIBOU_VISION_MODEL || config.models.terra || config.models.luna;
    const prompt = [
      "Tu notes une image candidate pour un Reel financier vertical.",
      `Narration: ${String(args.narration || "").slice(0, 3000)}`,
      `Idée visuelle attendue: ${String(args.visual_concept || "").slice(0, 3000)}`,
      `Style lock: ${String(args.style_lock || "").slice(0, 4000)}`,
      "Critères: adéquation à la phrase, compréhension en moins d'une seconde sur smartphone, composition simple, cohérence stylistique, absence d'artefacts/texte illisible. Une belle image hors sujet doit être sévèrement pénalisée."
    ].join("\n");
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: [{ role: "user", content: [
          { type: "input_text", text: prompt },
          { type: "input_image", image_url: `data:image/jpeg;base64,${base64}` },
        ] }],
        max_output_tokens: 600,
        text: { format: { type: "json_schema", name: "visual_qc", strict: true, schema: {
          type: "object", additionalProperties: false,
          properties: {
            score: { type: "integer", minimum: 0, maximum: 100 },
            semantic_match: { type: "integer", minimum: 0, maximum: 100 },
            smartphone_readability: { type: "integer", minimum: 0, maximum: 100 },
            style_consistency: { type: "integer", minimum: 0, maximum: 100 },
            artifact_quality: { type: "integer", minimum: 0, maximum: 100 },
            regenerate: { type: "boolean" },
            reason: { type: "string" }
          },
          required: ["score", "semantic_match", "smartphone_readability", "style_consistency", "artifact_quality", "regenerate", "reason"]
        } } }
      }),
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw openAiError(response, data, "Visual QC");
    const result = JSON.parse(responseOutputText(data));
    return { ok: true, path: String(image.path || ""), ...result };
  }
  if (body.name === "social_status") {
    return { ok: true, policy: await socialPolicySnapshot(), providers: socialGatewayStatus() };
  }
  if (body.name === "social_prepare") {
    return dispatchSocialPost({
      provider: args.provider,
      media_url: args.media_url,
      caption: args.caption,
      title: args.title,
      privacy_level: args.privacy_level,
      dry_run: true,
      is_aigc: true,
      metadata: { source_job: job.fields?.job_id || job.id },
    });
  }
  if (body.name === "generate_image" && videoAction(action)) {
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
    if (!(/^[a-f0-9]{40}$/.test(args.branch) || /^hibou-(agent|review)\/[a-zA-Z0-9._/-]+$/.test(args.branch)) || args.branch.includes("..")) throw new Error("Référence Git refusée");
    const rawUrl = `https://raw.githubusercontent.com/Lehibouruse/le-hibou-ruse-site/${args.branch}/${args.video_path}`;
    await updateRecord(TABLES.content, args.record_id, {
      "Vidéo finale": [{ url: rawUrl }],
      "Vidéo master": [{ url: rawUrl }],
      "Statut": "Validation humaine",
      "Validation humaine": false,
      "Statut publication": "À valider par Marc — aucune publication autorisée",
      "État production vidéo": "HUMAN_REVIEW",
      "Version pipeline vidéo": "2.0",
      "Journal automatisation": String(args.notes || "Brouillon autonome généré").slice(0, 5000),
      "Erreur pipeline": "",
    });
    const scenePrefix = String(args.record_id) + "_scene_";
    const escapedPrefix = scenePrefix.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
    const sceneRecords = await queryRecords(TABLES.videoScenes, { filterByFormula: `FIND("${escapedPrefix}", {Scène})=1`, pageSize: 50 }).catch(() => []);
    for (const scene of sceneRecords) {
      let manifest = {};
      try { manifest = JSON.parse(scene.fields?.["Candidats JSON"] || "{}"); } catch {}
      const selected = String(manifest.selected_path || "");
      if (/^public\/generated\/[a-zA-Z0-9._/-]+\.(png|jpg|jpeg)$/.test(selected) && !selected.includes("..")) {
        await updateRecord(TABLES.videoScenes, scene.id, {
          "Image retenue URL": `https://raw.githubusercontent.com/Lehibouruse/le-hibou-ruse-site/${args.branch}/${selected}`,
          "Statut": "Montée",
        }).catch(() => {});
      }
    }
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
  const telemetry = body.telemetry || {};

  if (outcome.status === "failed" && isCreditExhausted(outcome.result)) {
    const circuit = await openOpenAiCircuit(outcome.result, now);
    const paused = creditPausePatch(job.fields, circuit, outcome.result);
    await updateRecord(TABLES.jobs, job.id, {
      ...paused,
      result: String(outcome.result || "").slice(0, 100000),
      model_used: telemetry.model || "",
      reasoning_effort: telemetry.reasoning || "",
      input_tokens: Number(telemetry.input_tokens || 0),
      cached_input_tokens: Number(telemetry.cached_input_tokens || 0),
      output_tokens: Number(telemetry.output_tokens || 0),
      estimated_cost_usd: Number(telemetry.cost || 0),
      ai_calls: Number(telemetry.ai_calls || 0),
      response_ids: (telemetry.response_ids || []).join("\n"),
      external_id: String(body.external_id || "").slice(0, 1000),
    });
    await createRecord(TABLES.journal, {
      Workflow: "HIBOU_AGENT_V1 — GitHub worker",
      Déclencheur: "GitHub Actions OIDC",
      Action: `${actionName(job)} · ${job.fields?.job_id || job.id} · PAUSED_CREDIT`,
      Erreur: String(outcome.result || "").slice(0, 5000),
      Notes: JSON.stringify({
        executed_at: new Date(now).toISOString(),
        circuit_until: circuit.until,
        retry_count_preserved: paused.retry_count,
        model: telemetry.model || "",
        ai_calls: Number(telemetry.ai_calls || 0),
        cost_usd: Number(telemetry.cost || 0),
      }),
    }).catch((error) => console.error("Agent credit pause journal write failed", error?.message || error));
    return { ok: true, status: "Retry", paused_credit: true, until: circuit.until, retry_count: paused.retry_count };
  }

  const terminal = outcome.status === "completed"
    ? { status: "Completed", completed_at: new Date(now).toISOString(), next_run_at: null, retry_count: Number(job.fields?.retry_count || 0) }
    : outcome.status === "waiting_for_human"
      ? { status: "Manual Review", completed_at: new Date(now).toISOString(), next_run_at: null, retry_count: Number(job.fields?.retry_count || 0) }
      : failureDisposition(job.fields, now);
  const status = terminal.status;
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