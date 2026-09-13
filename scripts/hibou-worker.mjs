import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import { vercelCommitState } from "../lib/agent-runtime.mjs";

const API = process.env.HIBOU_WORKER_URL || "https://le-hibou-ruse-site.vercel.app/api/agent-worker";
const ROOT = process.cwd();
const MAX_STEPS = 16;
const MAX_AI_CALLS = 8;
const MAX_AI_COST_USD = 2;
let testsPassed = false;
let buildPassed = false;

function safeJobId(value) {
  return String(value || "job").toLowerCase().replace(/[^a-z0-9._-]+/g, "-").slice(0, 80);
}

async function oidcToken() {
  const base = process.env.ACTIONS_ID_TOKEN_REQUEST_URL;
  const bearer = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN;
  if (!base || !bearer) throw new Error("OIDC GitHub indisponible");
  const url = new URL(base);
  url.searchParams.set("audience", "hibou-orchestrator");
  const response = await fetch(url, { headers: { Authorization: `bearer ${bearer}` } });
  if (!response.ok) throw new Error(`OIDC GitHub: ${response.status}`);
  return (await response.json()).value;
}

async function api(body) {
  const response = await fetch(API, {
    method: "POST", headers: { Authorization: `Bearer ${await oidcToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.error || `Worker API: ${response.status}`);
  return data;
}

function safePath(path, mode = "read") {
  const normalized = String(path || "").replaceAll("\\", "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("..") || normalized.includes("\0")) throw new Error("Chemin refusé");
  if (mode === "site" && (!/^(app|components|public)\//.test(normalized) || /^app\/api\//.test(normalized))) throw new Error("Écriture hors fichiers du site");
  if (mode === "media" && !/^public\/generated\/[a-z0-9._/-]+\.(png|jpg|jpeg|mp3|wav|srt|mp4)$/i.test(normalized)) throw new Error("Artefact hors public/generated");
  const full = resolve(ROOT, normalized);
  if (relative(ROOT, full).startsWith("..")) throw new Error("Chemin hors dépôt");
  let cursor = ROOT;
  for (const part of normalized.split("/").slice(0, -1)) {
    cursor = resolve(cursor, part);
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw new Error("Chemin symbolique refusé");
  }
  return { normalized, full };
}

function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 8 * 1024 * 1024, ...options }).slice(0, 50000);
  } catch (error) {
    throw new Error(`${command} a échoué\n${String(error.stdout || "").slice(-12000)}\n${String(error.stderr || "").slice(-12000)}`);
  }
}

function secondsToSrt(value) {
  const ms = Math.max(0, Math.round(value * 1000));
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
}

function createSrt(scenes, outputPath) {
  let cursor = 0;
  const text = scenes.map((scene, index) => {
    const start = cursor;
    cursor += Number(scene.duration_seconds);
    return `${index + 1}\n${secondsToSrt(start)} --> ${secondsToSrt(cursor)}\n${String(scene.caption).replace(/\r?\n/g, " ")}\n`;
  }).join("\n");
  writeFileSync(outputPath, text, "utf8");
}

function branchName(jobId) {
  return `hibou-agent/${safeJobId(jobId)}-${process.env.GITHUB_RUN_ID || Date.now()}`;
}

async function pushBranch(job, message) {
  if (!testsPassed || !buildPassed) throw new Error("Tests et build requis avant proposition");
  const branch = branchName(job.fields.job_id);
  run("git", ["checkout", "-b", branch]);
  run("git", ["config", "user.name", "hibou-agent[bot]"]);
  run("git", ["config", "user.email", "hibou-agent[bot]@users.noreply.github.com"]);
  run("git", ["add", "--", "app", "components", "public"]);
  const changed = run("git", ["diff", "--cached", "--name-only"]).trim();
  if (!changed) throw new Error("Aucun changement autorisé à proposer");
  const changedPaths = changed.split(/\r?\n/).filter(Boolean);
  if (changedPaths.some((path) => !/^(app\/(?!api\/)|components\/|public\/)/.test(path) || path.includes(".."))) {
    throw new Error("Diff hors chemins autorisés");
  }
  run("git", ["commit", "-m", String(message).slice(0, 120)]);
  run("git", ["push", "origin", `HEAD:refs/heads/${branch}`]);
  return { branch, commit: run("git", ["rev-parse", "HEAD"]).trim(), changedPaths };
}

async function openPullRequest(pushed, job) {
  const { branch, commit, changedPaths } = pushed;
  const token = process.env.GITHUB_TOKEN;
  if (!token) return { branch, commit, changed_paths: changedPaths, pull_request: null, merged: false, warning: "GITHUB_TOKEN absent" };
  const response = await fetch("https://api.github.com/repos/Lehibouruse/le-hibou-ruse-site/pulls", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28" },
    body: JSON.stringify({ title: `Hibou agent: ${job.fields.job_id}`, head: branch, base: "main", body: `Proposition autonome bornée pour le job ${job.fields.job_id}. Tests et build exécutés. Fusion automatique seulement après statut Vercel réussi.` }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) return { branch, commit, changed_paths: changedPaths, pull_request: null, merged: false, warning: `PR ${response.status}` };
  let vercel = "pending";
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const statusResponse = await fetch(`https://api.github.com/repos/Lehibouruse/le-hibou-ruse-site/commits/${commit}/status`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    });
    const statusData = await statusResponse.json().catch(() => ({}));
    if (!statusResponse.ok) return { branch, commit, changed_paths: changedPaths, pull_request: data.html_url, merged: false, warning: `Statut Vercel ${statusResponse.status}` };
    vercel = vercelCommitState(statusData.statuses || []);
    if (vercel !== "pending") break;
    await new Promise((resolveWait) => setTimeout(resolveWait, 10000));
  }
  if (vercel !== "success") return { branch, commit, changed_paths: changedPaths, pull_request: data.html_url, merged: false, vercel, warning: "Fusion refusée: preview Vercel non validée" };
  const merge = await fetch(`https://api.github.com/repos/Lehibouruse/le-hibou-ruse-site/pulls/${data.number}/merge`, {
    method: "PUT", headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28" },
    body: JSON.stringify({ sha: commit, merge_method: "squash", commit_title: `Hibou agent: ${job.fields.job_id}` }),
  });
  const mergeData = await merge.json().catch(() => ({}));
  return { branch, commit, changed_paths: changedPaths, pull_request: data.html_url, merged: merge.ok && mergeData.merged === true, merge_message: mergeData.message || "", vercel };
}

async function executeTool(call, state) {
  const args = JSON.parse(call.arguments || "{}");
  switch (call.name) {
    case "airtable_read":
      return api({ operation: "tool", record_id: state.record_id, lock_token: state.lock_token, name: call.name, arguments: args });
    case "repo_list":
      return { files: run("git", ["ls-files"]).split(/\r?\n/).filter(Boolean).slice(0, 1000) };
    case "repo_read": {
      const file = safePath(args.path);
      if (!existsSync(file.full)) throw new Error("Fichier introuvable");
      return { path: file.normalized, content: readFileSync(file.full, "utf8").slice(0, 60000) };
    }
    case "site_write": {
      const file = safePath(args.path, "site");
      mkdirSync(dirname(file.full), { recursive: true });
      writeFileSync(file.full, String(args.content), "utf8");
      testsPassed = false; buildPassed = false;
      return { written: file.normalized, bytes: Buffer.byteLength(String(args.content)) };
    }
    case "git_diff":
      return { status: run("git", ["status", "--short"]), diff: run("git", ["diff", "--stat"]) + run("git", ["diff", "--", "app", "components", "public"]).slice(0, 50000) };
    case "run_tests":
      {
        const output = run("npm", ["test"]);
        testsPassed = true;
        return { ok: true, output };
      }
    case "run_build":
      {
        const output = run("npm", ["run", "build"]);
        buildPassed = true;
        return { ok: true, output };
      }
    case "propose_changes": {
      const pushed = await pushBranch(state.job, args.message);
      const proposal = await openPullRequest(pushed, state.job);
      state.external_id = proposal.pull_request || pushed.branch;
      return proposal;
    }
    case "generate_image":
    case "generate_speech": {
      const file = safePath(args.path, "media");
      const result = await api({ operation: "tool", record_id: state.record_id, lock_token: state.lock_token, name: call.name, arguments: args });
      mkdirSync(dirname(file.full), { recursive: true });
      writeFileSync(file.full, Buffer.from(result.base64, "base64"));
      testsPassed = false; buildPassed = false;
      return { ok: true, path: file.normalized, bytes: Buffer.byteLength(result.base64, "base64") };
    }
    case "generate_music": {
      const file = safePath(args.path, "media");
      mkdirSync(dirname(file.full), { recursive: true });
      const duration = Math.min(90, Math.max(2, Number(args.duration_seconds)));
      run("ffmpeg", ["-y", "-f", "lavfi", "-i", `sine=frequency=110:duration=${duration}`, "-af", "volume=0.035,afade=t=in:st=0:d=1,afade=t=out:st=" + Math.max(0, duration - 2) + ":d=2", file.full]);
      testsPassed = false; buildPassed = false;
      return { ok: true, path: file.normalized, original: true, mood: args.mood };
    }
    case "assemble_video": {
      const output = safePath(args.output_path, "media");
      const voice = safePath(args.voice_path, "media");
      const music = args.music_path ? safePath(args.music_path, "media") : null;
      const scenes = args.scenes.map((scene) => ({ ...scene, image: safePath(scene.image_path, "media") }));
      mkdirSync(dirname(output.full), { recursive: true });
      const listPath = resolve(dirname(output.full), "scenes.ffconcat");
      const srtPath = resolve(dirname(output.full), "subtitles.srt");
      const concat = ["ffconcat version 1.0", ...scenes.flatMap((scene) => [`file '${scene.image.full.replaceAll("'", "'\\''")}'`, `duration ${Number(scene.duration_seconds)}`]), `file '${scenes.at(-1).image.full.replaceAll("'", "'\\''")}'`].join("\n");
      writeFileSync(listPath, concat, "utf8");
      createSrt(scenes, srtPath);
      const inputs = ["-f", "concat", "-safe", "0", "-i", listPath, "-i", voice.full];
      if (music) inputs.push("-i", music.full);
      const escapedSrt = srtPath.replaceAll("\\", "/").replace(":", "\\:").replaceAll("'", "\\'");
      const audio = music ? "[1:a]volume=1[a1];[2:a]volume=0.15[a2];[a1][a2]amix=inputs=2:duration=first[a]" : "[1:a]anull[a]";
      run("ffmpeg", ["-y", ...inputs, "-filter_complex", `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,subtitles='${escapedSrt}':force_style='Fontsize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=3,Alignment=2,MarginV=170'[v];${audio}`, "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "medium", "-crf", "22", "-c:a", "aac", "-b:a", "160k", "-pix_fmt", "yuv420p", "-shortest", "-movflags", "+faststart", output.full]);
      testsPassed = false; buildPassed = false;
      return { ok: true, path: output.normalized, bytes: readFileSync(output.full).byteLength, publication: false };
    }
    case "register_video_draft": {
      const video = safePath(args.video_path, "media");
      if (!existsSync(video.full)) throw new Error("Brouillon vidéo introuvable");
      if (readFileSync(video.full).byteLength > 90 * 1024 * 1024) throw new Error("Brouillon supérieur à 90 Mo");
      const pushed = await pushBranch(state.job, `Add autonomous video draft for ${state.job.fields.job_id}`);
      const proposal = await openPullRequest(pushed, state.job);
      const result = await api({ operation: "tool", record_id: state.record_id, lock_token: state.lock_token, name: call.name, arguments: { ...args, branch: pushed.branch } });
      state.external_id = result.url;
      return { ...result, proposal };
    }
    case "deployment_check": {
      const attempts = Math.min(12, Math.max(1, Number(args.attempts) || 1));
      let last = "";
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const response = await fetch("https://le-hibou-ruse-site.vercel.app/api/health", { cache: "no-store" });
        last = await response.text();
        if (response.ok) return { ok: true, status: response.status, body: last.slice(0, 5000), attempt: attempt + 1 };
        if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 15000));
      }
      throw new Error(`Déploiement non prêt: ${last.slice(0, 1000)}`);
    }
    default:
      throw new Error(`Outil local refusé: ${call.name}`);
  }
}

function initialInput(job) {
  return [{ role: "user", content: [{ type: "input_text", text: `Exécute ce Job avec les outils autorisés.\n${JSON.stringify({ job_id: job.fields.job_id, action: job.fields.action?.name || job.fields.action, target: job.fields.target || "", parameters: JSON.parse(job.fields.parameters || "{}") })}` }] }];
}

function finalText(response) {
  if (response.output_text) return response.output_text;
  return (response.output || []).flatMap((item) => item.content || []).filter((item) => item.type === "output_text").map((item) => item.text).join("");
}

async function main() {
  const claimed = await api({ operation: "claim" });
  if (!claimed.claimed) { console.log("Aucun job agentique éligible."); return; }
  const state = { ...claimed, external_id: "" };
  const input = initialInput(claimed.job);
  const telemetry = { model: claimed.model, reasoning: claimed.reasoning, input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, cost: 0, ai_calls: 0, response_ids: [] };
  let outcome = { status: "failed", result: "Limite d'étapes atteinte", confidence: 0 };
  try {
    for (let step = 0; step < MAX_STEPS; step += 1) {
      if (telemetry.ai_calls >= MAX_AI_CALLS) throw new Error("Plafond d'appels IA du worker atteint");
      if (telemetry.cost >= MAX_AI_COST_USD) throw new Error("Plafond de coût IA du worker atteint");
      const result = await api({ operation: "step", record_id: state.record_id, lock_token: state.lock_token, input });
      const response = result.response;
      telemetry.ai_calls += 1; telemetry.response_ids.push(response.id);
      telemetry.input_tokens += Number(response.usage?.input_tokens || 0);
      telemetry.cached_input_tokens += Number(response.usage?.input_tokens_details?.cached_tokens || 0);
      telemetry.output_tokens += Number(response.usage?.output_tokens || 0); telemetry.cost += Number(result.estimated_cost_usd || 0);
      input.push(...(response.output || []));
      const calls = (response.output || []).filter((item) => item.type === "function_call");
      if (!calls.length) {
        outcome = JSON.parse(finalText(response));
        break;
      }
      for (const call of calls) {
        let toolResult;
        try { toolResult = await executeTool(call, state); }
        catch (error) { toolResult = { ok: false, error: String(error.message || error).slice(0, 12000) }; }
        input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(toolResult) });
      }
    }
  } catch (error) {
    outcome = { status: "failed", result: String(error.message || error), confidence: 0 };
  }
  await api({ operation: "finalize", record_id: state.record_id, lock_token: state.lock_token, outcome, telemetry, external_id: state.external_id });
  console.log(JSON.stringify({ job_id: state.job.fields.job_id, outcome, telemetry: { ...telemetry, response_ids: telemetry.response_ids.length } }));
  if (outcome.status === "failed") process.exitCode = 1;
}

await main();
