#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

function fail(message) { throw new Error(message); }
function sleep(ms) { return new Promise(resolveSleep => setTimeout(resolveSleep, ms)); }

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  }
  return value;
}

export function stableJobId(kind, request) {
  const digest = createHash("sha256").update(JSON.stringify(canonical({ kind, request }))).digest("hex");
  return `${kind.toLowerCase()}-${digest.slice(0, 24)}`;
}

function isLoopback(raw) {
  const url = new URL(raw);
  return ["127.0.0.1", "localhost", "::1", "[::1]"].includes(url.hostname);
}

function safeId(value, label) {
  const text = String(value || "");
  if (!/^[A-Za-z0-9._-]+$/.test(text)) fail(`${label} must use A-Z a-z 0-9 . _ - only`);
  return text;
}

export function validateImageRequest(request) {
  if (request.interface !== "IMAGE_GEN_V1") fail("interface must be IMAGE_GEN_V1");
  if (request.engine !== "comfyui") fail("IMAGE_GEN_V1 currently supports comfyui only");
  safeId(request.content_id, "content_id");
  safeId(request.scene_id, "scene_id");
  const endpoint = String(process.env.HIBOU_COMFY_ENDPOINT_OVERRIDE || request.endpoint || "http://127.0.0.1:8188");
  if (!isLoopback(endpoint)) fail("ComfyUI endpoint must be loopback/local");
  if (!request.workflow_path) fail("workflow_path required");
  if (!Array.isArray(request.output_node_ids) || request.output_node_ids.length < 1) fail("output_node_ids required");
  if (request.overrides && typeof request.overrides !== "object") fail("overrides must be an object");
  const retries = Number(request.max_retries ?? 1);
  if (!Number.isInteger(retries) || retries < 0 || retries > 2) fail("max_retries must be 0..2");
  const timeout = Number(request.timeout_seconds ?? 600);
  if (!Number.isFinite(timeout) || timeout < 10 || timeout > 3600) fail("timeout_seconds must be 10..3600");
  return { ...request, endpoint, max_retries: retries, timeout_seconds: timeout };
}

export function validateVoiceRequest(request) {
  if (request.interface !== "VOICE_GEN_V1") fail("interface must be VOICE_GEN_V1");
  if (request.engine !== "chatterbox_multilingual") fail("VOICE_GEN_V1 currently supports chatterbox_multilingual only");
  safeId(request.content_id, "content_id");
  safeId(request.scene_id, "scene_id");
  if (!String(request.text || "").trim()) fail("text required");
  if (String(request.text).length > 300) fail("one breath unit must be <=300 characters for this wrapper");
  if ((request.language_id || "fr") !== "fr") fail("Hibou VOICE_GEN_V1 is locked to French for now");
  const exaggeration = Number(request.exaggeration ?? 0.5);
  const temperature = Number(request.temperature ?? 0.8);
  const cfgWeight = Number(request.cfg_weight ?? 0.5);
  if (exaggeration < 0.25 || exaggeration > 2) fail("exaggeration must be 0.25..2");
  if (temperature < 0.05 || temperature > 5) fail("temperature must be 0.05..5");
  if (cfgWeight < 0 || cfgWeight > 1) fail("cfg_weight must be 0..1");
  return {
    ...request,
    language_id: "fr",
    exaggeration,
    temperature,
    cfg_weight: cfgWeight,
    seed: Number(request.seed ?? 0),
    model_variant: String(request.model_variant || "v3"),
  };
}

export function applyWorkflowOverrides(workflow, overrides = {}) {
  const copy = structuredClone(workflow);
  for (const [nodeId, inputs] of Object.entries(overrides)) {
    if (!copy[nodeId]?.inputs) fail(`workflow node missing: ${nodeId}`);
    for (const [key, value] of Object.entries(inputs || {})) {
      if (!(key in copy[nodeId].inputs)) fail(`workflow input missing: ${nodeId}.${key}`);
      copy[nodeId].inputs[key] = value;
    }
  }
  return copy;
}

function shaText(value) {
  return createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

function shaCanonical(value) {
  return createHash("sha256").update(JSON.stringify(canonical(value)), "utf8").digest("hex");
}

export function verifyComfyPromptExecution(request, workflow) {
  const app = request?.prompt_application;
  if (!app) return null;
  if (!["HIBOU_IMAGE_PROMPT_APPLICATION_V1", "HIBOU_IMAGE_PROMPT_APPLICATION_V2"].includes(app.schema)) {
    fail("unsupported prompt_application schema");
  }
  const nodeId = String(app.prompt_node_id || "");
  const input = String(app.prompt_input || "");
  const applied = workflow?.[nodeId]?.inputs?.[input];
  if (typeof applied !== "string" || !applied.length) {
    fail(`compiled prompt missing from applied workflow at ${nodeId}.${input}`);
  }
  const appliedSha = shaText(applied);
  const expectedSha = String(app.compiled_prompt_sha256 || "");
  if (!expectedSha || appliedSha !== expectedSha) {
    fail("ComfyUI applied prompt hash mismatch before /prompt submission");
  }
  return {
    schema: "HIBOU_COMFY_PROMPT_EXECUTION_V1",
    prompt_verified: true,
    prompt_node_id: nodeId,
    prompt_input: input,
    compiled_prompt_sha256: expectedSha,
    applied_prompt_sha256: appliedSha,
    workflow_sha256: shaCanonical(workflow),
  };
}

function artifactRoot(request) {
  const root = resolve(process.env.HIBOU_VIDEO_OUTPUT_ROOT || ".hibou-video-artifacts");
  return resolve(root, safeId(request.content_id, "content_id"), safeId(request.scene_id, "scene_id"));
}

function manifestReusable(path, requestHash, request) {
  if (!existsSync(path)) return false;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    if (parsed.request_sha256 !== requestHash || !(parsed.outputs || []).every(output => existsSync(output.path))) return false;
    if (request?.prompt_application) {
      const receipt = parsed.execution_receipt;
      return receipt?.schema === "HIBOU_COMFY_PROMPT_EXECUTION_V1" &&
        receipt.prompt_verified === true &&
        receipt.applied_prompt_sha256 === request.prompt_application.compiled_prompt_sha256;
    }
    return true;
  } catch { return false; }
}

async function fetchJson(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) fail(`HTTP ${response.status}: ${JSON.stringify(body).slice(0, 1000)}`);
    return body;
  } finally { clearTimeout(timer); }
}

export async function runImageGen(rawRequest) {
  const request = validateImageRequest(rawRequest);
  const workflowFile = resolve(request.workflow_path);
  const workflowBytes = readFileSync(workflowFile);
  const workflowTemplateSha256 = createHash("sha256").update(workflowBytes).digest("hex");
  if (request.workflow_sha256 && request.workflow_sha256 !== workflowTemplateSha256) {
    fail("ComfyUI workflow content drifted after image plan creation");
  }
  const effectiveRequest = { ...request, workflow_sha256: workflowTemplateSha256 };
  const jobId = stableJobId("IMAGE_GEN", effectiveRequest);
  const requestHash = jobId.split("-").at(-1);
  const outDir = resolve(artifactRoot(request), "images", jobId);
  const manifest = resolve(outDir, "manifest.json");
  if (manifestReusable(manifest, requestHash, effectiveRequest)) return JSON.parse(readFileSync(manifest, "utf8"));
  mkdirSync(outDir, { recursive: true });

  const workflow = applyWorkflowOverrides(JSON.parse(workflowBytes.toString("utf8")), request.overrides || {});
  const executionReceipt = verifyComfyPromptExecution(effectiveRequest, workflow);
  let lastError;

  for (let attempt = 0; attempt <= request.max_retries; attempt += 1) {
    try {
      const submitted = await fetchJson(new URL("/prompt", request.endpoint), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          prompt: workflow,
          client_id: String(process.env.HIBOU_VIDEO_CLIENT_ID || "hibou-local-worker"),
        }),
      });
      const promptId = String(submitted?.prompt_id || "").trim();
      if (!promptId) fail("ComfyUI /prompt returned no prompt_id");
      const submittedExecutionReceipt = executionReceipt
        ? { ...executionReceipt, prompt_id: promptId }
        : null;
      const deadline = Date.now() + request.timeout_seconds * 1000;
      let history;
      while (Date.now() < deadline) {
        const all = await fetchJson(new URL(`/history/${encodeURIComponent(promptId)}`, request.endpoint), {}, 10000);
        history = all[promptId];
        if (history?.outputs) break;
        await sleep(1000);
      }
      if (!history?.outputs) {
        try {
          await fetch(new URL("/interrupt", request.endpoint), { method: "POST" });
          await sleep(750);
        } catch {}
        fail("ComfyUI timeout waiting for history");
      }

      const outputs = [];
      for (const nodeId of request.output_node_ids.map(String)) {
        const images = history.outputs?.[nodeId]?.images || [];
        for (let i = 0; i < images.length; i += 1) {
          const item = images[i];
          const params = new URLSearchParams({ filename: item.filename, subfolder: item.subfolder || "", type: item.type || "output" });
          const response = await fetch(new URL(`/view?${params}`, request.endpoint));
          if (!response.ok) fail(`ComfyUI /view failed: ${response.status}`);
          const ext = extname(item.filename) || ".png";
          const target = resolve(outDir, `${safeId(nodeId, "output node")}-${String(i + 1).padStart(2, "0")}${ext}`);
          writeFileSync(target, Buffer.from(await response.arrayBuffer()));
          outputs.push({ node_id: nodeId, source_name: basename(item.filename), path: target });
        }
      }
      if (!outputs.length) fail("ComfyUI completed but no requested image output was found");
      const result = {
        interface: request.interface,
        engine: request.engine,
        job_id: jobId,
        request_sha256: requestHash,
        workflow_template_sha256: workflowTemplateSha256,
        execution_receipt: submittedExecutionReceipt,
        attempts: attempt + 1,
        outputs,
        paid_fallback: false
      };
      writeFileSync(manifest, JSON.stringify(result, null, 2));
      return result;
    } catch (error) {
      lastError = error;
      if (attempt >= request.max_retries) throw error;
      await sleep(1500);
    }
  }
  throw lastError;
}

export function runVoiceGen(rawRequest) {
  const request = validateVoiceRequest(rawRequest);
  const jobId = stableJobId("VOICE_GEN", request);
  const requestHash = jobId.split("-").at(-1);
  const outDir = resolve(artifactRoot(request), "voice", jobId);
  const output = resolve(outDir, "voice.wav");
  const manifest = resolve(outDir, "manifest.json");
  if (manifestReusable(manifest, requestHash)) return JSON.parse(readFileSync(manifest, "utf8"));
  mkdirSync(outDir, { recursive: true });
  const requestFile = resolve(outDir, "request.json");
  writeFileSync(requestFile, JSON.stringify(request, null, 2));

  const python = process.env.HIBOU_PYTHON || "python3";
  const result = spawnSync(python, [resolve("scripts/chatterbox-local.py"), requestFile, output], { encoding: "utf8" });
  if (result.status !== 0) fail(`Chatterbox wrapper failed: ${result.stderr?.slice(-4000) || result.stdout}`);
  if (!existsSync(output)) fail("Chatterbox wrapper returned without WAV output");

  const payload = {
    interface: request.interface,
    engine: request.engine,
    job_id: jobId,
    request_sha256: requestHash,
    outputs: [{ path: output }],
    native_parameters: {
      language_id: request.language_id,
      exaggeration: request.exaggeration,
      temperature: request.temperature,
      seed: request.seed,
      cfg_weight: request.cfg_weight,
      model_variant: request.model_variant,
      audio_prompt_path: request.audio_prompt_path || null,
    },
    prosody_metadata_not_native: request.prosody || null,
    paid_fallback: false,
  };
  writeFileSync(manifest, JSON.stringify(payload, null, 2));
  return payload;
}

if(import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const [kind, requestPath] = process.argv.slice(2);
  if (!kind || !requestPath) fail("usage: node scripts/video-local-adapters.mjs IMAGE_GEN|VOICE_GEN request.json");
  const request = JSON.parse(readFileSync(resolve(requestPath), "utf8"));
  const result = kind === "IMAGE_GEN" ? await runImageGen(request)
    : kind === "VOICE_GEN" ? runVoiceGen(request)
      : fail("kind must be IMAGE_GEN or VOICE_GEN");
  process.stdout.write(`${JSON.stringify(result)}\n`);
}
