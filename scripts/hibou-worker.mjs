import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve, relative } from "node:path";
import { vercelCommitState } from "../lib/agent-runtime.mjs";

const API = process.env.HIBOU_WORKER_URL || "https://le-hibou-ruse-site.vercel.app/api/agent-worker";
const ROOT = process.cwd();
const MAX_STEPS = Math.max(40, Number(process.env.HIBOU_WORKER_MAX_STEPS || 80));
const MAX_AI_CALLS = 32;
const MAX_AI_COST_USD = 2;
const BACKGROUND_POLL_MS = 4000;
const MAX_BACKGROUND_POLLS = 150;
let testsPassed = false;
let buildPassed = false;
let videoQcPassed = false;

function safeJobId(value) {
  return String(value || "job").toLowerCase().replace(/[^a-z0-9._-]+/g, "-").slice(0, 80);
}

function sleep(ms) {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

function jobParameters(job) {
  try { return JSON.parse(job.fields?.parameters || "{}"); } catch { return {}; }
}

function pinnedTier(job) {
  const params = jobParameters(job);
  const value = String(params.model_tier || params.requested_model || "").toLowerCase();
  if (value.includes("astra")) return "astra";
  if (value.includes("sol")) return "sol";
  if (value.includes("terra")) return "terra";
  if (value.includes("luna")) return "luna";
  return null;
}

function chooseStepTier(job, baseTier, step, previousTools, previousFailure) {
  const pinned = pinnedTier(job);
  if (pinned) return pinned;
  if (step === 0) return baseTier || "sol";
  if (previousFailure) return "sol";
  if (previousTools.length > 0) return "terra";
  return baseTier || "sol";
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

async function checkpoint(state, telemetry, details) {
  return api({
    operation: "checkpoint",
    record_id: state.record_id,
    lock_token: state.lock_token,
    telemetry,
    ...details,
  });
}

async function modelStep(state, input, modelTier) {
  const started = await api({
    operation: "step", record_id: state.record_id, lock_token: state.lock_token,
    input, model_tier: modelTier,
  });
  let result = started;
  let response = started.response;
  if (!response?.id) throw new Error("OpenAI background response sans identifiant");

  for (let poll = 0; result.pending || ["queued", "in_progress"].includes(response.status); poll += 1) {
    if (poll >= MAX_BACKGROUND_POLLS) throw new Error(`OpenAI background timeout: ${response.id}`);
    await sleep(BACKGROUND_POLL_MS);
    result = await api({
      operation: "step_status", record_id: state.record_id, lock_token: state.lock_token,
      response_id: response.id,
    });
    response = result.response;
  }

  if (response.status !== "completed") {
    const detail = response.error?.message || response.incomplete_details?.reason || response.status || "unknown";
    throw new Error(`OpenAI background response ${response.status}: ${detail}`);
  }
  return {
    ...result,
    response,
    tier: started.tier || modelTier,
    model: started.model || response.model,
    reasoning: started.reasoning || "",
  };
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
    throw new Error(`${command} a échoué: ${String(error.message || error)} (code=${error.status ?? error.code ?? "inconnu"})\n${String(error.stdout || "").slice(-12000)}\n${String(error.stderr || "").slice(-12000)}`);
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

function branchName(job) {
  const action = job.fields?.action?.name || job.fields?.action || "";
  const mediaJob = action === "CREATE_VIDEO" || action === "REGENERATE_SCENE";
  const mergeAuthorized = !mediaJob && jobParameters(job).merge_authorization === true;
  const prefix = mergeAuthorized ? "hibou-agent" : "hibou-review";
  return `${prefix}/${safeJobId(job.fields.job_id)}-${process.env.GITHUB_RUN_ID || Date.now()}`;
}

async function pushBranch(job, message) {
  if (!testsPassed || !buildPassed) throw new Error("Tests et build requis avant proposition");
  const branch = branchName(job);
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
  const mergeAuthorized = jobParameters(job).merge_authorization === true;
  const response = await fetch("https://api.github.com/repos/Lehibouruse/le-hibou-ruse-site/pulls", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28" },
    body: JSON.stringify({ title: `Hibou agent: ${job.fields.job_id}`, head: branch, base: "main", body: `Proposition autonome bornée pour le job ${job.fields.job_id}. Tests et build exécutés. Fusion automatique uniquement si le Job contient parameters.merge_authorization=true; dans ce cas une preview Vercel verte reste obligatoire.` }),
  });
  const data = await response.json().catch(() => ({}));
  const acceptedPermissions = response.headers.get("x-accepted-github-permissions") || "";
  if (!response.ok) {
    const detail = data?.message || data?.error || "unknown";
    return { branch, commit, changed_paths: changedPaths, pull_request: null, merged: false, warning: `PR ${response.status}: ${String(detail).slice(0, 500)}`, accepted_github_permissions: acceptedPermissions };
  }
  if (!mergeAuthorized) {
    return { branch, commit, changed_paths: changedPaths, pull_request: data.html_url, merged: false, vercel: "skipped", warning: "PR prête pour revue; fusion automatique non autorisée, preview Vercel économisée" };
  }
  let vercel = "pending";
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const statusResponse = await fetch(`https://api.github.com/repos/Lehibouruse/le-hibou-ruse-site/commits/${commit}/status`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    });
    const statusData = await statusResponse.json().catch(() => ({}));
    if (!statusResponse.ok) return { branch, commit, changed_paths: changedPaths, pull_request: data.html_url, merged: false, warning: `Statut Vercel ${statusResponse.status}` };
    vercel = vercelCommitState(statusData.statuses || []);
    if (vercel !== "pending") break;
    await sleep(10000);
  }
  if (vercel !== "success") return { branch, commit, changed_paths: changedPaths, pull_request: data.html_url, merged: false, vercel, warning: "Fusion refusée: preview Vercel non validée" };
  const merge = await fetch(`https://api.github.com/repos/Lehibouruse/le-hibou-ruse-site/pulls/${data.number}/merge`, {
    method: "PUT", headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28" },
    body: JSON.stringify({ sha: commit, merge_method: "squash", commit_title: `Hibou agent: ${job.fields.job_id}` }),
  });
  const mergeData = await merge.json().catch(() => ({}));
  return { branch, commit, changed_paths: changedPaths, pull_request: data.html_url, merged: merge.ok && mergeData.merged === true, merge_sha: mergeData.sha || "", merge_message: mergeData.message || "", vercel };
}

async function executeTool(call, state) {
  const args = JSON.parse(call.arguments || "{}");
  switch (call.name) {
    case "airtable_read":
    case "scene_save":
    case "video_state":
      return api({ operation: "tool", record_id: state.record_id, lock_token: state.lock_token, name: call.name, arguments: args });
    case "visual_qc": {
      const file = safePath(args.image_path, "media");
      if (!existsSync(file.full)) throw new Error("Image candidate introuvable");
      const preview = resolve(dirname(file.full), "qc-preview.jpg");
      run("ffmpeg", ["-y", "-i", file.full, "-vf", "scale=720:-2", "-q:v", "5", preview]);
      const result = await api({
        operation: "tool", record_id: state.record_id, lock_token: state.lock_token, name: call.name,
        arguments: {
          narration: args.narration,
          visual_concept: args.visual_concept,
          style_lock: args.style_lock,
          image: { path: file.normalized, base64: readFileSync(preview).toString("base64") },
        },
      });
      rmSync(preview, { force: true });
      return result;
    }
    case "prune_media": {
      const prefix = String(args.prefix || "").replaceAll("\\", "/").replace(/^\/+/, "").replace(/\/+$/, "");
      if (!/^public\/generated\/[a-z0-9._-]+$/i.test(prefix)) throw new Error("Préfixe média refusé");
      const keep = new Set((args.keep_paths || []).map((path) => safePath(path, "media").full));
      const prefixFull = resolve(ROOT, prefix);
      if (!existsSync(prefixFull)) return { ok: true, removed: 0, kept: keep.size };
      const found = run("find", [prefixFull, "-type", "f"]).split(/\r?\n/).filter(Boolean);
      let removed = 0;
      for (const full of found) {
        const relativePath = relative(ROOT, full).replaceAll("\\", "/");
        if (!/^public\/generated\/[a-z0-9._/-]+\.(png|jpg|jpeg|mp3|wav|srt|mp4)$/i.test(relativePath)) continue;
        if (!keep.has(resolve(ROOT, relativePath))) {
          rmSync(full, { force: true });
          removed += 1;
        }
      }
      return { ok: true, removed, kept: keep.size };
    }
    case "repo_list":
      return { files: run("git", ["ls-files"]).split(/\r?\n/).filter(Boolean).slice(0, 1000) };
    case "repo_read": {
      const file = safePath(args.path);
      if (!existsSync(file.full)) throw new Error("Fichier introuvable");
      return { path: file.normalized, content: readFileSync(file.full, "utf8").slice(0, 60000) };
    }
    case "repo_read_many": {
      let remaining = 120000;
      const files = [];
      for (const path of args.paths.slice(0, 12)) {
        const file = safePath(path);
        if (!existsSync(file.full)) { files.push({ path: file.normalized, error: "Fichier introuvable" }); continue; }
        const content = readFileSync(file.full, "utf8").slice(0, remaining);
        remaining -= content.length;
        files.push({ path: file.normalized, content });
        if (remaining <= 0) break;
      }
      return { files };
    }
    case "social_status":
    case "social_prepare":
      return api({ operation: "tool", record_id: state.record_id, lock_token: state.lock_token, name: call.name, arguments: args });
    case "site_write": {
      const file = safePath(args.path, "site");
      mkdirSync(dirname(file.full), { recursive: true });
      writeFileSync(file.full, String(args.content), "utf8");
      testsPassed = false; buildPassed = false; videoQcPassed = false;
      return { written: file.normalized, bytes: Buffer.byteLength(String(args.content)) };
    }
    case "site_edit": {
      const file = safePath(args.path, "site");
      if (!existsSync(file.full)) throw new Error("Fichier introuvable");
      const content = readFileSync(file.full, "utf8");
      const oldText = String(args.old_text || "");
      if (!oldText) throw new Error("old_text vide");
      const occurrences = content.split(oldText).length - 1;
      if (occurrences !== 1) throw new Error(`old_text doit être unique (occurrences=${occurrences})`);
      const next = content.replace(oldText, String(args.new_text));
      writeFileSync(file.full, next, "utf8");
      testsPassed = false; buildPassed = false;
      return { written: file.normalized, bytes: Buffer.byteLength(next), changed_bytes: Buffer.byteLength(String(args.new_text)) - Buffer.byteLength(oldText) };
    }
    case "git_diff":
      return { status: run("git", ["status", "--short"]), diff: run("git", ["diff", "--stat"]) + run("git", ["diff", "--", "app", "components", "public"]).slice(0, 50000) };
    case "run_tests": {
      const output = run("npm", ["test"]);
      testsPassed = true;
      return { ok: true, output };
    }
    case "run_build": {
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
      testsPassed = false; buildPassed = false; videoQcPassed = false;
      return { ok: true, path: file.normalized, bytes: Buffer.byteLength(result.base64, "base64") };
    }
    case "generate_music": {
      const file = safePath(args.path, "media");
      mkdirSync(dirname(file.full), { recursive: true });
      const duration = Math.min(90, Math.max(2, Number(args.duration_seconds)));
      run("ffmpeg", ["-y", "-f", "lavfi", "-i", `sine=frequency=110:duration=${duration}`, "-af", "volume=0.035,afade=t=in:st=0:d=1,afade=t=out:st=" + Math.max(0, duration - 2) + ":d=2", file.full]);
      testsPassed = false; buildPassed = false; videoQcPassed = false;
      return { ok: true, path: file.normalized, original: true, mood: args.mood };
    }
    case "assemble_video": {
      const output = safePath(args.output_path, "media");
      const voice = safePath(args.voice_path, "media");
      const music = args.music_path ? safePath(args.music_path, "media") : null;
      let scenes = args.scenes.map((scene) => ({
        ...scene,
        duration_seconds: Number(scene.duration_seconds),
        zoom_percent: Math.max(0, Math.min(6, Number(scene.zoom_percent || 3))),
        anchor: String(scene.anchor || "centre"),
        image: safePath(scene.image_path, "media"),
      }));
      mkdirSync(dirname(output.full), { recursive: true });
      const clipDir = resolve(dirname(output.full), "clips");
      mkdirSync(clipDir, { recursive: true });
      const listPath = resolve(dirname(output.full), "scenes.ffconcat");
      const visualPath = resolve(dirname(output.full), "visual-only.mp4");
      const srtPath = resolve(dirname(output.full), "subtitles.srt");
      const logoPath = resolve(dirname(output.full), "hibou-logo.png");
      run("rsvg-convert", ["-w", "132", "-h", "132", "-o", logoPath, resolve(ROOT, "public/hibou.svg")]);
      const voiceDuration = Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", voice.full]).trim());
      const plannedDuration = scenes.reduce((total, scene) => total + scene.duration_seconds, 0);
      if (Number.isFinite(voiceDuration) && voiceDuration > 0 && plannedDuration > 0) {
        const scale = voiceDuration / plannedDuration;
        scenes = scenes.map((scene) => ({ ...scene, duration_seconds: Math.max(0.8, scene.duration_seconds * scale) }));
      }
      const clipPaths = [];
      const anchorExpr = (anchor) => {
        const centerX = "iw/2-(iw/zoom/2)";
        const centerY = "ih/2-(ih/zoom/2)";
        if (anchor === "gauche") return { x: "0", y: centerY };
        if (anchor === "droite") return { x: "iw-iw/zoom", y: centerY };
        if (anchor === "haut") return { x: centerX, y: "0" };
        if (anchor === "bas") return { x: centerX, y: "ih-ih/zoom" };
        return { x: centerX, y: centerY };
      };
      for (let index = 0; index < scenes.length; index += 1) {
        const scene = scenes[index];
        const frames = Math.max(30, Math.round(scene.duration_seconds * 30));
        const maxZoom = 1 + scene.zoom_percent / 100;
        const increment = Math.max(0.000001, (maxZoom - 1) / frames);
        const pos = anchorExpr(scene.anchor);
        const clipPath = resolve(clipDir, `scene-${String(index + 1).padStart(2, "0")}.mp4`);
        const vf = `scale=1200:2134:force_original_aspect_ratio=increase,crop=1200:2134,zoompan=z='if(eq(on,1),1.0,min(zoom+${increment.toFixed(8)},${maxZoom.toFixed(5)}))':x='${pos.x}':y='${pos.y}':d=${frames}:s=1080x1920:fps=30,format=yuv420p`;
        run("ffmpeg", ["-y", "-loop", "1", "-i", scene.image.full, "-vf", vf, "-t", String(scene.duration_seconds), "-an", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p", clipPath]);
        clipPaths.push(clipPath);
      }
      writeFileSync(listPath, ["ffconcat version 1.0", ...clipPaths.map((path) => `file '${path.replaceAll("'", "'\\''")}'`)].join("\n"), "utf8");
      run("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", visualPath]);
      createSrt(scenes, srtPath);
      const inputs = ["-i", visualPath, "-i", voice.full];
      if (music) inputs.push("-i", music.full);
      inputs.push("-loop", "1", "-i", logoPath);
      const logoInput = music ? 3 : 2;
      const escapedSrt = srtPath.replaceAll("\\", "/").replace(":", "\\:").replaceAll("'", "\\'");
      const audio = music ? "[1:a]volume=1[a1];[2:a]volume=0.14[a2];[a1][a2]amix=inputs=2:duration=first[a]" : "[1:a]anull[a]";
      run("ffmpeg", ["-y", ...inputs, "-filter_complex", `[0:v]subtitles='${escapedSrt}':force_style='Fontsize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=3,Alignment=2,MarginV=170'[base];[${logoInput}:v]format=rgba,colorchannelmixer=aa=0.92[logo];[base][logo]overlay=W-w-48:48:shortest=1:eof_action=pass[v];${audio}`, "-map", "[v]", "-map", "[a]", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-b:a", "160k", "-pix_fmt", "yuv420p", "-shortest", "-movflags", "+faststart", output.full]);
      testsPassed = false; buildPassed = false; videoQcPassed = false;
      return { ok: true, path: output.normalized, bytes: readFileSync(output.full).byteLength, scenes: scenes.length, stable_zoom: true, publication: false };
    }
    case "video_qc": {
      const video = safePath(args.video_path, "media");
      if (!existsSync(video.full)) throw new Error("Brouillon vidéo introuvable");
      const probe = JSON.parse(run("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height,duration:format=duration,size", "-of", "json", video.full]));
      const videoStream = (probe.streams || []).find((stream) => stream.codec_type === "video");
      const audioStream = (probe.streams || []).find((stream) => stream.codec_type === "audio");
      const duration = Number(probe.format?.duration || videoStream?.duration || 0);
      const bytes = Number(probe.format?.size || readFileSync(video.full).byteLength);
      const checks = { video: Boolean(videoStream), audio: Boolean(audioStream), vertical_1080x1920: videoStream?.width === 1080 && videoStream?.height === 1920, duration_ok: duration >= 5 && duration <= 90, size_ok: bytes >= 100000 && bytes <= 90 * 1024 * 1024 };
      videoQcPassed = Object.values(checks).every(Boolean);
      if (!videoQcPassed) throw new Error(`QC vidéo échoué: ${JSON.stringify({ checks, duration, bytes, width: videoStream?.width, height: videoStream?.height })}`);
      return { ok: true, score: 100, checks, duration_seconds: duration, bytes, publication: false };
    }
    case "register_video_draft": {
      const video = safePath(args.video_path, "media");
      if (!existsSync(video.full)) throw new Error("Brouillon vidéo introuvable");
      if (!videoQcPassed) throw new Error("video_qc réussi requis avant enregistrement");
      if (readFileSync(video.full).byteLength > 90 * 1024 * 1024) throw new Error("Brouillon supérieur à 90 Mo");
      const pushed = await pushBranch(state.job, `Add autonomous video draft for ${state.job.fields.job_id}`);
      const result = await api({ operation: "tool", record_id: state.record_id, lock_token: state.lock_token, name: call.name, arguments: { ...args, branch: pushed.branch } });
      state.external_id = result.url;
      return { ...result, branch: pushed.branch, commit: pushed.commit, vercel: "skipped" };
    }
    case "deployment_check": {
      const attempts = Math.min(12, Math.max(1, Number(args.attempts) || 1));
      let last = "";
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        const response = await fetch("https://le-hibou-ruse-site.vercel.app/api/health", { cache: "no-store" });
        last = await response.text();
        if (response.ok) return { ok: true, status: response.status, body: last.slice(0, 5000), attempt: attempt + 1 };
        if (attempt + 1 < attempts) await sleep(15000);
      }
      throw new Error(`Déploiement non prêt: ${last.slice(0, 1000)}`);
    }
    default:
      throw new Error(`Outil local refusé: ${call.name}`);
  }
}

function initialInput(job) {
  return [{ role: "user", content: [{ type: "input_text", text: `Exécute ce Job avec les outils autorisés.\n${JSON.stringify({ job_id: job.fields.job_id, action: job.fields.action?.name || job.fields.action, target: job.fields.target || "", parameters: jobParameters(job) })}` }] }];
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
  let previousTools = [];
  let previousFailure = false;
  try {
    for (let step = 0; step < MAX_STEPS; step += 1) {
      if (telemetry.ai_calls >= MAX_AI_CALLS) throw new Error("Plafond d'appels IA du worker atteint");
      if (telemetry.cost >= MAX_AI_COST_USD) throw new Error("Plafond de coût IA du worker atteint");
      const modelTier = chooseStepTier(state.job, state.tier, step, previousTools, previousFailure);
      const result = await modelStep(state, input, modelTier);
      const response = result.response;
      telemetry.model = result.model || response.model || telemetry.model;
      telemetry.reasoning = result.reasoning || telemetry.reasoning;
      telemetry.ai_calls += 1;
      telemetry.response_ids.push(response.id);
      telemetry.input_tokens += Number(response.usage?.input_tokens || 0);
      telemetry.cached_input_tokens += Number(response.usage?.input_tokens_details?.cached_tokens || 0);
      telemetry.output_tokens += Number(response.usage?.output_tokens || 0);
      telemetry.cost += Number(result.estimated_cost_usd || 0);
      await checkpoint(state, telemetry, { phase: "model", step: step + 1, tool: result.tier || modelTier, ok: true });
      input.push(...(response.output || []));
      const calls = (response.output || []).filter((item) => item.type === "function_call");
      if (!calls.length) {
        outcome = JSON.parse(finalText(response));
        break;
      }
      previousTools = [];
      previousFailure = false;
      for (const call of calls) {
        previousTools.push(call.name);
        let toolResult;
        try { toolResult = await executeTool(call, state); }
        catch (error) { toolResult = { ok: false, error: String(error.message || error).slice(0, 12000) }; }
        if (toolResult?.ok === false) previousFailure = true;
        await checkpoint(state, telemetry, { phase: "tool", step: step + 1, tool: call.name, ok: toolResult?.ok !== false, error: toolResult?.ok === false ? toolResult.error : "" });
        input.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify(toolResult) });
      }
    }
  } catch (error) {
    outcome = { status: "failed", result: String(error.message || error), confidence: 0 };
  }
  const finalized = await api({ operation: "finalize", record_id: state.record_id, lock_token: state.lock_token, outcome, telemetry, external_id: state.external_id });
  console.log(JSON.stringify({ job_id: state.job.fields.job_id, outcome, finalized: { status: finalized.status, paused_credit: finalized.paused_credit === true }, telemetry: { ...telemetry, response_ids: telemetry.response_ids.length } }));
  if (outcome.status === "failed" && finalized.paused_credit !== true) process.exitCode = 1;
}

await main();