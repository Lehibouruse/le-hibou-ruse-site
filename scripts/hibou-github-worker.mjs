import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const ROOT = process.env.HIBOU_MEDIA_ROOT || path.join(os.homedir(), "HibouMedia");
const POLL_MS = Math.max(5000, Number(process.env.HIBOU_WORKER_POLL_MS || 15000));
const WORKER_ID = process.env.HIBOU_WORKER_ID || `ROG-${os.hostname()}`;
const YTDLP = process.env.HIBOU_YTDLP || "yt-dlp";
const LOG_DIR = path.join(process.env.LOCALAPPDATA || ROOT, "LeHibou");
const LOG_FILE = path.join(LOG_DIR, "worker.log");
const STATE_FILE = path.join(LOG_DIR, "processed-jobs.json");
const APPROVAL_FILE = path.join(LOG_DIR, "approved-jobs.json");
const FAILED_FILE = path.join(LOG_DIR, "failed-jobs.json");
const WORKER_LOCK_FILE = path.join(LOG_DIR, "hibou-github-worker.lock");
const QUEUE_URL = process.env.HIBOU_QUEUE_URL || "https://raw.githubusercontent.com/Lehibouruse/le-hibou-ruse-site/main/config/local-worker-queue.json";
const REPORT_URL = process.env.HIBOU_REPORT_URL || "https://d4d5d6.com/api/local-worker-status";
const REPORT_TOKEN = String(process.env.HIBOU_LOCAL_REPORT_TOKEN || "").trim();
const ONCE = process.argv.includes("--once");
const DIAGNOSTIC = process.argv.includes("--diagnostic");
const EXECUTION_ENABLED = String(process.env.HIBOU_LOCAL_EXECUTION_ENABLED || "").trim().toLowerCase() === "true";
const APPROVED_JOB_ID = String(process.env.HIBOU_LOCAL_APPROVED_JOB_ID || "").trim();
const VIDEO_QUEUE_URL =
  process.env.HIBOU_VIDEO_QUEUE_URL ||
  "https://d4d5d6.com/api/local-worker-queue";

const VIDEO_RENDER_ENABLED =
  String(process.env.HIBOU_VIDEO_RENDER_ENABLED || "")
    .trim()
    .toLowerCase() === "true";

const VIDEO_REMOTE_CANCEL_ENABLED =
  String(process.env.HIBOU_VIDEO_REMOTE_CANCEL_ENABLED || "")
    .trim()
    .toLowerCase() === "true";
const VIDEO_CANCEL_GRACE_MS = Math.max(
  1000,
  Math.min(30000, Number(process.env.HIBOU_VIDEO_CANCEL_GRACE_MS || 5000)),
);

const WORKER_SELF_UPDATE_SCHEMA = "HIBOU_GITHUB_WORKER_SELF_UPDATE_V2";
const WORKER_BUILD_MARKER = "HIBOU_WORKER_BUILD_20260927_V2";
const WORKER_SELF_UPDATE_ENABLED =
  String(process.env.HIBOU_WORKER_SELF_UPDATE_ENABLED || "true")
    .trim()
    .toLowerCase() !== "false";
const WORKER_SOURCE = path.resolve(process.argv[1] || "");

const VIDEO_AUTOSTART_COMFYUI =
  String(process.env.HIBOU_VIDEO_AUTOSTART_COMFYUI || "")
    .trim()
    .toLowerCase() === "true";

const PROJECT_ROOT =
  process.env.HIBOU_PROJECT_ROOT ||
  path.join(os.homedir(), "le-hibou-ruse-site");

const VIDEO_BINDING =
  process.env.HIBOU_VIDEO_BINDING ||
  path.join(
    os.homedir(),
    "Documents",
    "Codex",
    "HibouVideo",
    "comfyui-binding.json",
  );

const VIDEO_OUTPUT_ROOT =
  process.env.HIBOU_VIDEO_OUTPUT_ROOT ||
  path.join(ROOT, "video-renders");

const VIDEO_MASTER_SCRIPT =
  String(process.env.HIBOU_VIDEO_MASTER_SCRIPT || "").trim() ||
  path.join(PROJECT_ROOT, "scripts", "video-master.mjs");

const CHATTERBOX_BATCH_SCRIPT =
  String(process.env.HIBOU_CHATTERBOX_BATCH_SCRIPT || "").trim() ||
  path.join(PROJECT_ROOT, "scripts", "chatterbox-storyboard-batch.py");

const COMFYUI_START_SCRIPT = path.join(
  LOG_DIR,
  "video-start-comfyui-windows.runtime.ps1",
);

const RUNTIME_REPO =
  "Lehibouruse/le-hibou-ruse-site";
const ALLOWED_HOSTS = new Set([
  "youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be",
  "instagram.com", "www.instagram.com",
  "tiktok.com", "www.tiktok.com", "vm.tiktok.com",
]);

mkdirSync(ROOT, { recursive: true });
mkdirSync(LOG_DIR, { recursive: true });
if (VIDEO_RENDER_ENABLED) {
  mkdirSync(VIDEO_OUTPUT_ROOT, { recursive: true });
}

let state = {
  started_at: new Date().toISOString(),
  worker_session: `${WORKER_ID}-${process.pid}-${Date.now()}`,
  worker_pid: process.pid,
  worker: WORKER_ID,
  status: "starting",
  queue_mode: "github-public-readonly+authenticated-video-render",
  current_job: null,
  render_pid: null,
  render_started_at: null,
  last_video_heartbeat_at: null,
  last_error: null,
  processed: 0,
};

function log(message, data = null) {
  const line = `[${new Date().toISOString()}] ${message}${data ? " " + JSON.stringify(data) : ""}`;
  console.log(line);
  appendFileSync(LOG_FILE, line + "\n", "utf8");
}

function pidAlive(pid) {
  const n = Number(pid);
  if (!Number.isInteger(n) || n <= 0) return false;
  try {
    process.kill(n, 0);
    return true;
  } catch {
    return false;
  }
}

function releaseWorkerLock() {
  try {
    const current = JSON.parse(readFileSync(WORKER_LOCK_FILE, "utf8"));
    if (Number(current?.pid) === process.pid) unlinkSync(WORKER_LOCK_FILE);
  } catch {}
}

function acquireWorkerLock() {
  mkdirSync(LOG_DIR, { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = openSync(WORKER_LOCK_FILE, "wx");
      writeFileSync(fd, JSON.stringify({
        pid: process.pid,
        worker: WORKER_ID,
        session: state.worker_session,
        started_at: state.started_at,
      }, null, 2), "utf8");
      closeSync(fd);
      process.once("exit", releaseWorkerLock);
      for (const signal of ["SIGINT", "SIGTERM"]) {
        process.once(signal, () => {
          releaseWorkerLock();
          process.exit(0);
        });
      }
      return true;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      try {
        const previous = JSON.parse(readFileSync(WORKER_LOCK_FILE, "utf8"));
        if (pidAlive(previous?.pid)) {
          log("Another Hibou worker instance is already alive", {
            pid: previous.pid,
            session: previous.session || null,
          });
          return false;
        }
      } catch {}
      try { unlinkSync(WORKER_LOCK_FILE); } catch {}
    }
  }
  throw new Error("Unable to acquire Hibou worker single-instance lock");
}

function loadProcessed() {
  try {
    const parsed = JSON.parse(readFileSync(STATE_FILE, "utf8"));
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveProcessed(set) {
  writeFileSync(STATE_FILE, JSON.stringify([...set], null, 2), "utf8");
}

function loadFailedJobs() {
  try {
    const parsed = JSON.parse(readFileSync(FAILED_FILE, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveFailedJobs(map) {
  writeFileSync(FAILED_FILE, JSON.stringify(map, null, 2), "utf8");
}

function loadApprovedJobs() {
  try {
    const raw = readFileSync(APPROVAL_FILE, "utf8").replace(/^\uFEFF/, "");
    const parsed = JSON.parse(raw);
    const ids = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.job_ids) ? parsed.job_ids : [];
    return new Set(ids.map((value) => String(value || "").trim()).filter(Boolean));
  } catch {
    return new Set();
  }
}

function safePart(value, fallback = "unknown") {
  const cleaned = String(value || fallback)
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return cleaned || fallback;
}

function normalizeUrls(values) {
  const raw = Array.isArray(values) ? values : String(values || "").split(/\r?\n/);
  const urls = raw.map((x) => String(x).trim()).filter(Boolean);
  return [...new Set(urls.map((value) => {
    const url = new URL(value);
    if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase())) throw new Error(`Hôte non autorisé: ${url.hostname}`);
    return url.toString();
  }))];
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true, shell: false });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; if (stdout.length > 200000) stdout = stdout.slice(-200000); });
    child.stderr.on("data", (chunk) => { stderr += chunk; if (stderr.length > 200000) stderr = stderr.slice(-200000); });
    child.on("error", reject);
    child.on("close", (code) => code === 0
      ? resolve({ code, stdout, stderr })
      : reject(new Error(`${command} exit ${code}\n${stderr.slice(-12000)}`)));
  });
}

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function normalizeRuntimeCommit(value) {
  const commit = String(value || "").trim().toLowerCase();
  return /^[0-9a-f]{40}$/.test(commit) ? commit : null;
}

async function ensureWorkerSelfUpdate(commit) {
  const normalized = normalizeRuntimeCommit(commit);

  if (!WORKER_SELF_UPDATE_ENABLED) {
    return { checked: false, updated: false, reason: "disabled" };
  }

  if (!normalized) {
    return { checked: false, updated: false, reason: "runtime_commit_invalid" };
  }

  if (state.current_job || state.render_pid) {
    return { checked: false, updated: false, reason: "worker_busy" };
  }

  if (state.worker_runtime_commit === normalized) {
    return { checked: true, updated: false, commit: normalized, reason: "already_checked" };
  }

  const managedRoot = path.resolve(LOG_DIR) + path.sep;
  const target = path.resolve(WORKER_SOURCE);

  if (!target.startsWith(managedRoot)) {
    state.worker_runtime_commit = normalized;
    return {
      checked: false,
      updated: false,
      commit: normalized,
      reason: "unmanaged_worker_source",
    };
  }

  const url =
    `https://raw.githubusercontent.com/${RUNTIME_REPO}/${normalized}/scripts/hibou-github-worker.mjs`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Le-Hibou-ROG-Worker/1.0",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `Worker self-update HTTP ${response.status}: ${normalized}`,
      );
    }

    const source = await response.text();
    for (const marker of [
      WORKER_SELF_UPDATE_SCHEMA,
      "async function processVideoRender",
    ]) {
      if (!source.includes(marker)) {
        throw new Error(
          `Worker self-update marker missing at ${normalized}: ${marker}`,
        );
      }
    }

    const current = readFileSync(target, "utf8");
    const currentHash = createHash("sha256").update(current).digest("hex");
    const remoteHash = createHash("sha256").update(source).digest("hex");

    state.worker_runtime_commit = normalized;
    state.worker_source_sha256 = currentHash;

    if (currentHash === remoteHash) {
      return {
        checked: true,
        updated: false,
        commit: normalized,
        sha256: currentHash,
        reason: "already_current",
      };
    }

    const temp = `${target}.candidate-${process.pid}`;
    writeFileSync(temp, source, "utf8");
    const candidateHash = sha256(temp);

    if (candidateHash !== remoteHash) {
      try { unlinkSync(temp); } catch {}
      throw new Error("Worker self-update candidate hash mismatch");
    }

    // Windows can keep the currently executed .mjs file open in ways that make
    // replace-by-rename unreliable. Overwrite the managed source explicitly,
    // then verify the exact installed bytes before requesting a restart.
    writeFileSync(target, source, "utf8");
    const installedHash = sha256(target);
    try { unlinkSync(temp); } catch {}

    if (installedHash !== remoteHash) {
      throw new Error("Worker self-update installed hash mismatch");
    }

    state.worker_source_sha256 = installedHash;
    state.worker_self_update_pending = true;

    log("Hibou worker self-update installed", {
      schema: WORKER_SELF_UPDATE_SCHEMA,
      commit: normalized,
      sha256: remoteHash,
      target,
    });

    return {
      checked: true,
      updated: true,
      commit: normalized,
      sha256: remoteHash,
      reason: "worker_replaced",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function assertRuntimeTarget(target, label) {
  const root = path.resolve(LOG_DIR) + path.sep;
  const resolved = path.resolve(target);
  if (!resolved.startsWith(root)) {
    throw new Error(
      `${label} runtime target must stay inside ${LOG_DIR}: ${resolved}`,
    );
  }
  return resolved;
}

async function installPinnedRuntime(commit, repoPath, target, markers) {
  const resolved = assertRuntimeTarget(target, repoPath);
  const url =
    `https://raw.githubusercontent.com/${RUNTIME_REPO}/${commit}/${repoPath}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Le-Hibou-ROG-Worker/1.0",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(
        `Runtime download HTTP ${response.status}: ${repoPath}@${commit}`,
      );
    }

    const source = await response.text();
    for (const marker of markers) {
      if (!source.includes(marker)) {
        throw new Error(
          `Runtime marker missing for ${repoPath}@${commit}: ${marker}`,
        );
      }
    }

    mkdirSync(path.dirname(resolved), { recursive: true });
    const temp = `${resolved}.tmp-${process.pid}`;
    writeFileSync(temp, source, "utf8");
    renameSync(temp, resolved);
    return { path: resolved, sha256: sha256(resolved) };
  } finally {
    clearTimeout(timeout);
  }
}

async function ensureCanonicalVideoRuntimes(job) {
  const commit = normalizeRuntimeCommit(job?.runtime_commit);
  if (!commit) {
    throw new Error("VIDEO_RENDER runtime_commit missing or invalid");
  }

  const diagnosticRuntimeDir = path.join(
    LOG_DIR,
    "diagnostic-runtime",
    commit,
  );
  const resumePlanScript = path.join(
    diagnosticRuntimeDir,
    "video-resume-plan.mjs",
  );
  const voiceDurationQcScript = path.join(
    diagnosticRuntimeDir,
    "video-voice-duration-qc.mjs",
  );

  if (
    state.runtime_commit === commit &&
    existsSync(VIDEO_MASTER_SCRIPT) &&
    existsSync(CHATTERBOX_BATCH_SCRIPT) &&
    existsSync(resumePlanScript) &&
    existsSync(voiceDurationQcScript)
  ) {
    state.runtime_resume_plan_path = resumePlanScript;
    return {
      commit,
      master: VIDEO_MASTER_SCRIPT,
      voice: CHATTERBOX_BATCH_SCRIPT,
      comfy_start: COMFYUI_START_SCRIPT,
      resume_plan: resumePlanScript,
      refreshed: false,
    };
  }

  const master = await installPinnedRuntime(
    commit,
    "scripts/video-master.mjs",
    VIDEO_MASTER_SCRIPT,
    [
      "pathToFileURL(resolve(process.argv[1])).href",
      "--- error tail ---",
    ],
  );

  const voice = await installPinnedRuntime(
    commit,
    "scripts/chatterbox-storyboard-batch.py",
    CHATTERBOX_BATCH_SCRIPT,
    [
      "inspect.signature(ChatterboxMultilingualTTS.from_pretrained)",
      "HIBOU_CHATTERBOX_LOAD_ROOT_CAUSE",
    ],
  );

  const comfyStart = await installPinnedRuntime(
    commit,
    "scripts/video-start-comfyui-windows.ps1",
    COMFYUI_START_SCRIPT,
    [
      "COMFYUI_AUTOSTART_V2",
      "Start-Process",
    ],
  );

  const voiceDurationQc = await installPinnedRuntime(
    commit,
    "scripts/video-voice-duration-qc.mjs",
    voiceDurationQcScript,
    [
      "HIBOU_VOICE_DURATION_QC_V1",
      "auditVoiceDurations",
    ],
  );

  const resumePlan = await installPinnedRuntime(
    commit,
    "scripts/video-resume-plan.mjs",
    resumePlanScript,
    [
      "HIBOU_VIDEO_RESUME_PLAN_V1",
      "execution_performed: false",
    ],
  );

  state.runtime_commit = commit;
  state.runtime_master_sha256 = master.sha256;
  state.runtime_voice_sha256 = voice.sha256;
  state.runtime_comfy_start_sha256 = comfyStart.sha256;
  state.runtime_voice_duration_qc_sha256 = voiceDurationQc.sha256;
  state.runtime_resume_plan_sha256 = resumePlan.sha256;
  state.runtime_resume_plan_path = resumePlan.path;

  log("VIDEO_RENDER runtimes refreshed", {
    commit,
    master: master.path,
    master_sha256: master.sha256,
    voice: voice.path,
    voice_sha256: voice.sha256,
    comfy_start: comfyStart.path,
    comfy_start_sha256: comfyStart.sha256,
    resume_plan: resumePlan.path,
    resume_plan_sha256: resumePlan.sha256,
  });

  return {
    commit,
    master: master.path,
    voice: voice.path,
    comfy_start: comfyStart.path,
    resume_plan: resumePlan.path,
    refreshed: true,
  };
}

function stableStoryboard(value) {
  const clone = JSON.parse(JSON.stringify(value || {}));
  if (clone.content && typeof clone.content === "object") {
    delete clone.content.exported_at;
  }
  return clone;
}

function jsonEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function pipelineFailureDetail(dir) {
  const statePath = path.join(dir, "pipeline-run.json");
  if (!existsSync(statePath)) return "";
  try {
    const pipeline = JSON.parse(readFileSync(statePath, "utf8"));
    const failed = Object.entries(pipeline?.stages || {})
      .filter(([, info]) => info?.status === "ERROR")
      .at(-1);
    if (!failed) return "";
    const [stageName, info] = failed;
    const full = String(info?.error || "unknown stage error");
    const message = full.length > 3600
      ? full.slice(0, 700) + "\n--- stage error tail ---\n" + full.slice(-2800)
      : full;
    return ` stage=${stageName}; error=${message}`;
  } catch {
    return "";
  }
}

function buildVideoFailureDiagnostic(job, errorMessage) {
  const jobId = String(job?.id || "").trim();
  const dir = jobId
    ? path.join(VIDEO_OUTPUT_ROOT, safePart(jobId))
    : null;
  const generatedAt = new Date().toISOString();
  const diagnostic = {
    schema: "HIBOU_VIDEO_RENDER_FAILURE_DIAGNOSTIC_V1",
    job: jobId || null,
    content_id: String(job?.options?.content_id || "") || null,
    worker: WORKER_ID,
    worker_session: state.worker_session,
    generated_at: generatedAt,
    error: String(errorMessage || "").slice(0, 12000),
    local_root: dir,
    resume_plan_path: null,
    resume_plan: null,
    resume_planner_executed: false,
    resume_execution_performed: false,
    human_review_required: true,
    publication_authorized: false,
    paid_fallback: false,
  };

  if (!dir || !existsSync(path.join(dir, "pipeline-run.json"))) {
    return diagnostic;
  }

  const planner = String(state.runtime_resume_plan_path || "").trim();
  if (!planner || !existsSync(planner)) {
    diagnostic.resume_plan_error = "commit-pinned resume planner unavailable";
    return diagnostic;
  }

  const output = path.join(dir, "_hibou_video_resume_plan.json");
  const planned = spawnSync(
    process.execPath,
    [planner, dir, output, `--platform=${process.platform}`],
    {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
      windowsHide: true,
      shell: false,
      env: process.env,
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  diagnostic.resume_planner_executed = true;

  if (planned.status !== 0 || !existsSync(output)) {
    diagnostic.resume_plan_error =
      String(planned.stderr || planned.stdout || "resume planner failed")
        .slice(-4000);
    return diagnostic;
  }

  try {
    const plan = JSON.parse(readFileSync(output, "utf8"));
    diagnostic.resume_plan_path = output;
    diagnostic.resume_plan = {
      schema: plan.schema || null,
      resume_required: Boolean(plan.resume_required),
      resume_stage: plan.resume_stage || null,
      failed_stages: Array.isArray(plan.failed_stages)
        ? plan.failed_stages.slice(0, 30)
        : [],
      inferred_invalidations: Array.isArray(plan.inferred_invalidations)
        ? plan.inferred_invalidations.slice(0, 30)
        : [],
      stages_to_reset: Array.isArray(plan.stages_to_reset)
        ? plan.stages_to_reset.slice(0, 40)
        : [],
      preservable_artifacts: plan.preservable_artifacts || null,
      required_runtime_capabilities:
        Array.isArray(plan.required_runtime_capabilities)
          ? plan.required_runtime_capabilities.slice(0, 30)
          : [],
      execution_performed: false,
      publication_authorized: false,
    };
  } catch (error) {
    diagnostic.resume_plan_error =
      "resume plan unreadable: " + String(error?.message || error);
  }

  try {
    writeFileSync(
      path.join(dir, "_hibou_video_failure_diagnostic.json"),
      JSON.stringify(diagnostic, null, 2) + "\n",
      "utf8",
    );
  } catch {}

  return diagnostic;
}

function pipelineHeartbeatSnapshot(dir) {
  const statePath = path.join(dir, "pipeline-run.json");
  if (!existsSync(statePath)) {
    return {
      current_stage: "starting",
      completed_stages: [],
      failed_stages: [],
    };
  }
  try {
    const pipeline = JSON.parse(readFileSync(statePath, "utf8"));
    const entries = Object.entries(pipeline?.stages || {});
    const running = entries.find(([, info]) => info?.status === "RUNNING");
    const failed = entries.filter(([, info]) => info?.status === "ERROR");
    const passed = entries.filter(([, info]) => info?.status === "PASS");
    const lastKnown = [...entries].reverse().find(([, info]) =>
      ["PASS", "ERROR", "RUNNING"].includes(info?.status)
    );
    return {
      current_stage: running?.[0] || lastKnown?.[0] || "starting",
      completed_stages: passed.map(([name]) => name),
      failed_stages: failed.map(([name]) => name),
    };
  } catch {
    return {
      current_stage: "unknown",
      completed_stages: [],
      failed_stages: [],
    };
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function comfyEndpointFromBinding() {
  const binding = JSON.parse(readFileSync(VIDEO_BINDING, "utf8"));
  const endpoint = String(binding?.endpoint || "http://127.0.0.1:8188").trim();
  const url = new URL(endpoint);
  const host = url.hostname.toLowerCase();
  if (!["127.0.0.1", "localhost", "[::1]", "::1"].includes(host)) {
    throw new Error("ComfyUI endpoint must remain loopback-only");
  }
  return url.toString().replace(/\/$/, "");
}

async function comfyReady(endpoint) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(new URL("/system_stats", endpoint), {
      signal: controller.signal,
      headers: { "User-Agent": "Le-Hibou-ROG-Worker/1.0" },
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

async function ensureComfyUIReady() {
  const endpoint = comfyEndpointFromBinding();
  if (await comfyReady(endpoint)) {
    return { endpoint, started: false };
  }

  if (!VIDEO_AUTOSTART_COMFYUI) {
    throw new Error(
      `ComfyUI unavailable at ${endpoint}; HIBOU_VIDEO_AUTOSTART_COMFYUI is disabled`,
    );
  }

  if (process.platform !== "win32") {
    throw new Error("Automatic ComfyUI start is Windows-only");
  }

  const startScript = existsSync(COMFYUI_START_SCRIPT)
    ? COMFYUI_START_SCRIPT
    : path.join(PROJECT_ROOT, "scripts", "video-start-comfyui-windows.ps1");

  if (!existsSync(startScript)) {
    throw new Error(`ComfyUI start script missing: ${startScript}`);
  }

  const url = new URL(endpoint);
  const port = Number(url.port || 8188);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`Invalid ComfyUI port: ${url.port}`);
  }

  log("Starting ComfyUI automatically", { endpoint, port, startScript });

  let starterResult;
  try {
    starterResult = await run(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        startScript,
        "-Port",
        String(port),
      ],
      PROJECT_ROOT,
    );
  } catch (error) {
    throw new Error(
      "ComfyUI starter failed before readiness polling\n" +
      String(error?.message || error),
    );
  }

  log("ComfyUI starter returned", {
    endpoint,
    stdout: String(starterResult?.stdout || "").slice(-3000),
    stderr: String(starterResult?.stderr || "").slice(-3000),
  });

  const statePath = path.join(LOG_DIR, "logs", "comfyui-autostart-state.json");
  let startedPid = null;
  try {
    const startedState = JSON.parse(
      readFileSync(statePath, "utf8").replace(/^\uFEFF/, ""),
    );
    startedPid = Number(startedState?.pid || 0) || null;
  } catch {}

  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (await comfyReady(endpoint)) {
      log("ComfyUI ready", { endpoint, pid: startedPid });
      return { endpoint, started: true };
    }
    if (startedPid && !pidAlive(startedPid)) {
      log("ComfyUI child exited before readiness", { endpoint, pid: startedPid });
      break;
    }
    await sleep(2000);
  }

  const logDir = path.join(LOG_DIR, "logs");
  const stderrPath = path.join(logDir, "comfyui-autostart.stderr.log");
  const stdoutPath = path.join(logDir, "comfyui-autostart.stdout.log");
  const tail = (file) => {
    try { return readFileSync(file, "utf8").slice(-5000); } catch { return ""; }
  };
  const stderrTail = tail(stderrPath);
  const stdoutTail = tail(stdoutPath);
  throw new Error(
    `ComfyUI did not become ready within 180 seconds: ${endpoint}` +
    (startedPid ? `\nComfyUI child pid: ${startedPid}; alive=${pidAlive(startedPid)}` : "\nComfyUI child pid: unavailable") +
    (starterResult?.stderr ? `\n--- starter stderr ---\n${String(starterResult.stderr).slice(-3000)}` : "") +
    (starterResult?.stdout ? `\n--- starter stdout ---\n${String(starterResult.stdout).slice(-3000)}` : "") +
    (stderrTail ? `\n--- ComfyUI stderr tail ---\n${stderrTail}` : "") +
    (stdoutTail ? `\n--- ComfyUI stdout tail ---\n${stdoutTail}` : "")
  );
}

async function fetchQueue() {
  const response = await fetch(`${QUEUE_URL}?t=${Date.now()}`, { headers: { "User-Agent": "Le-Hibou-ROG-Worker/1.0" } });
  if (!response.ok) throw new Error(`Queue HTTP ${response.status}`);
  const data = await response.json();
  if (!data || !Array.isArray(data.jobs)) throw new Error("Format de queue invalide");
  return data.jobs.filter((job) => job && job.active !== false);
}

async function fetchVideoQueue() {
  if (!VIDEO_RENDER_ENABLED) return [];
  if (!REPORT_TOKEN) {
    throw new Error("HIBOU_LOCAL_REPORT_TOKEN missing for VIDEO_RENDER");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const separator = VIDEO_QUEUE_URL.includes("?") ? "&" : "?";
    const response = await fetch(
      `${VIDEO_QUEUE_URL}${separator}t=${Date.now()}`,
      {
        headers: {
          "User-Agent": "Le-Hibou-ROG-Worker/1.0",
          Authorization: `Bearer ${REPORT_TOKEN}`,
          "X-Hibou-Worker": WORKER_ID,
          "X-Hibou-Worker-Session": state.worker_session,
          "X-Hibou-Worker-Build": WORKER_BUILD_MARKER,
        },
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      throw new Error(`Video queue HTTP ${response.status}`);
    }

    const data = await response.json();

    if (!data || !Array.isArray(data.jobs)) {
      throw new Error("Invalid VIDEO_RENDER queue format");
    }

    const selfUpdate = await ensureWorkerSelfUpdate(data.runtime_commit);
    if (selfUpdate.updated) {
      state.status = "self_updating";
      setTimeout(() => process.exit(75), 100);
      return [];
    }

    return data.jobs.filter(
      (job) =>
        job &&
        job.active !== false &&
        job.type === "VIDEO_RENDER",
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchVideoControl(jobId) {
  if (!VIDEO_REMOTE_CANCEL_ENABLED || !REPORT_TOKEN) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const separator = VIDEO_QUEUE_URL.includes("?") ? "&" : "?";
    const response = await fetch(
      `${VIDEO_QUEUE_URL}${separator}control_job_id=${encodeURIComponent(jobId)}&t=${Date.now()}`,
      {
        headers: {
          "User-Agent": "Le-Hibou-ROG-Worker/1.0",
          Authorization: `Bearer ${REPORT_TOKEN}`,
          "X-Hibou-Worker": WORKER_ID,
          "X-Hibou-Worker-Session": state.worker_session,
        },
        signal: controller.signal,
      },
    );
    if (!response.ok) throw new Error(`Video control HTTP ${response.status}`);
    const data = await response.json();
    const controls = Array.isArray(data?.controls) ? data.controls : [];
    return controls.find((control) =>
      control?.job_id === jobId
      && ["cancel_requested", "supersede_requested"].includes(control?.state)
    ) || null;
  } finally {
    clearTimeout(timeout);
  }
}

function cancellationMatchesOwnedChild(job, child, control) {
  if (!VIDEO_REMOTE_CANCEL_ENABLED || !job?.id || !child?.pid || !control) return false;
  if (String(control.job_id || "") !== String(job.id)) return false;
  if (state.current_job !== job.id || Number(state.render_pid) !== Number(child.pid)) return false;
  const expectedSession = String(control.expected_worker_session || "").trim();
  if (expectedSession && expectedSession !== state.worker_session) return false;
  const expectedWorker = String(control.expected_worker || "").trim();
  if (expectedWorker && expectedWorker !== WORKER_ID) return false;
  return child.exitCode === null;
}

function comfyQueueClient(item) {
  if (Array.isArray(item)) {
    const extra = item[3];
    return String(extra?.client_id || extra?.extra_data?.client_id || "");
  }
  return String(item?.client_id || item?.extra_data?.client_id || "");
}

function comfyQueuePromptId(item) {
  if (Array.isArray(item)) return String(item[1] || "");
  return String(item?.prompt_id || item?.id || "");
}

async function cancelOwnedComfyPrompts(clientId) {
  const id = String(clientId || "").trim();
  if (!id) return { checked: false, reason: "client_id_missing", running: 0, pending: 0 };
  const endpoint = comfyEndpointFromBinding();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(new URL("/queue", endpoint), {
      headers: { "User-Agent": "Le-Hibou-ROG-Worker/1.0" },
      signal: controller.signal,
    });
    if (!response.ok) {
      return { checked: false, reason: `queue_http_${response.status}`, running: 0, pending: 0 };
    }
    const queue = await response.json();
    const running = (Array.isArray(queue?.queue_running) ? queue.queue_running : [])
      .filter((item) => comfyQueueClient(item) === id);
    const pending = (Array.isArray(queue?.queue_pending) ? queue.queue_pending : [])
      .filter((item) => comfyQueueClient(item) === id);
    const pendingIds = pending.map(comfyQueuePromptId).filter(Boolean);

    if (running.length) {
      await fetch(new URL("/interrupt", endpoint), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Le-Hibou-ROG-Worker/1.0",
        },
        body: "{}",
      }).catch(() => null);
    }
    if (pendingIds.length) {
      await fetch(new URL("/queue", endpoint), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Le-Hibou-ROG-Worker/1.0",
        },
        body: JSON.stringify({ delete: pendingIds }),
      }).catch(() => null);
    }
    return {
      checked: true,
      client_id: id,
      running: running.length,
      pending: pendingIds.length,
      deleted_prompt_ids: pendingIds,
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function terminateOwnedRender(job, child, control) {
  if (!cancellationMatchesOwnedChild(job, child, control)) {
    return { terminated: false, reason: "scope_mismatch" };
  }
  const pid = Number(child.pid);
  state.cancel_request = {
    job_id: job.id,
    request_id: String(control.request_id || ""),
    state: control.state,
    render_pid: pid,
    requested_at: control.requested_at || null,
  };
  log("VIDEO_RENDER cancellation accepted", state.cancel_request);

  const comfyCancellation = await cancelOwnedComfyPrompts(state.render_client_id)
    .catch((error) => ({
      checked: false,
      reason: "cancel_failed",
      error: String(error?.message || error).slice(0, 1000),
    }));

  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T"], {
      encoding: "utf8", windowsHide: true, shell: false,
    });
  } else {
    try { child.kill("SIGTERM"); } catch {}
  }

  const deadline = Date.now() + VIDEO_CANCEL_GRACE_MS;
  while (Date.now() < deadline && child.exitCode === null && pidAlive(pid)) {
    await sleep(200);
  }

  let forced = false;
  if (
    child.exitCode === null
    && pidAlive(pid)
    && state.current_job === job.id
    && Number(state.render_pid) === pid
  ) {
    forced = true;
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
        encoding: "utf8", windowsHide: true, shell: false,
      });
    } else {
      try { child.kill("SIGKILL"); } catch {}
    }
  }

  return {
    terminated: true,
    forced,
    job_id: job.id,
    render_pid: pid,
    request_id: String(control.request_id || ""),
    state: control.state,
    comfy: comfyCancellation,
  };
}

async function reportVideoProgress(job, status, data = {}) {
  if (!REPORT_TOKEN) {
    throw new Error("HIBOU_LOCAL_REPORT_TOKEN missing for VIDEO_RENDER report");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(VIDEO_QUEUE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Le-Hibou-ROG-Worker/1.0",
        Authorization: `Bearer ${REPORT_TOKEN}`,
      },
      body: JSON.stringify({
        airtable_record_id: job.airtable_record_id || job.id,
        job_id: job.id,
        status,
        worker: WORKER_ID,
        local_path: data.local_path || "",
        result_sha256: data.result_sha256 || "",
        result: data.result || null,
        error: data.error || "",
        heartbeat: data.heartbeat === true,
        worker_session: state.worker_session,
        worker_pid: process.pid,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `VIDEO_RENDER report HTTP ${response.status}: ${body.slice(0, 500)}`,
      );
    }
  } finally {
    clearTimeout(timeout);
  }
}

async function reportProgress(job, status, data = {}) {
  if (!REPORT_TOKEN) {
    log("Progress report skipped", { job: job?.id, status, reason: "report_token_missing" });
    return;
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(REPORT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "Le-Hibou-ROG-Worker/1.0", Authorization: `Bearer ${REPORT_TOKEN}` },
      body: JSON.stringify({
        job_id: job.id,
        concurrent: job.concurrent || "",
        label: job.label || "",
        status,
        worker: WORKER_ID,
        video_count: Number(data.video_count || 0),
        bytes: Number(data.bytes || 0),
        local_path: data.local_path || "",
        completed_at: data.completed_at || "",
        error: data.error || "",
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) log("Progress report rejected", { job: job.id, status, http: response.status });
  } catch (error) {
    log("Progress report failed", { job: job?.id, status, error: String(error?.message || error).slice(0, 500) });
  }
}

async function downloadOne(url, dir, options = {}) {
  mkdirSync(dir, { recursive: true });
  const maxHeight = Math.max(360, Math.min(2160, Number(options.max_height || 1080)));
  const outputTemplate = "%(uploader)s/%(upload_date)s - %(title)s [%(id)s].%(ext)s";

  // Phase 1: the MP4 is the priority. Do not let optional subtitles block the media.
  const mediaArgs = [
    "--newline", "--no-progress", "--windows-filenames", "--restrict-filenames",
    "--write-info-json",
    "--write-thumbnail", "--convert-thumbnails", "jpg",
    "--retries", "10",
    "--fragment-retries", "10",
    "--retry-sleep", "http:exp=1:20",
    "--sleep-requests", "1",
    "-f", `bv*[height<=${maxHeight}]+ba/b[height<=${maxHeight}]`,
    "--merge-output-format", "mp4",
    "-o", outputTemplate,
    "--no-playlist",
    url,
  ];

  const started = Date.now();
  const mediaResult = await run(YTDLP, mediaArgs, dir);

  // Phase 2: subtitles are optional enrichment only.
  let subtitleResult = { attempted: false, ok: null, error: "" };
  if (options.download_subtitles === true) {
    const subtitleLangs = Array.isArray(options.subtitle_languages) && options.subtitle_languages.length
      ? options.subtitle_languages.join(",") : "fr";
    const subtitleArgs = [
      "--skip-download",
      "--write-subs", "--write-auto-subs",
      "--sub-langs", subtitleLangs,
      "--sub-format", "srt/best",
      "--retries", "3",
      "--retry-sleep", "http:2",
      "--sleep-requests", "2",
      "-o", outputTemplate,
      "--no-playlist",
      url,
    ];
    subtitleResult.attempted = true;
    try {
      await run(YTDLP, subtitleArgs, dir);
      subtitleResult.ok = true;
    } catch (error) {
      subtitleResult.ok = false;
      subtitleResult.error = String(error?.message || error).slice(0, 1500);
      log("Optional subtitles skipped", { url, error: subtitleResult.error });
    }
  }

  return {
    url,
    elapsed_s: Math.round((Date.now() - started) / 100) / 10,
    stdout_tail: mediaResult.stdout.slice(-3000),
    stderr_tail: mediaResult.stderr.slice(-3000),
    subtitles: subtitleResult,
  };
}
function profileVideoUrl(entry, profileUrl) {
  const direct = String(entry?.webpage_url || entry?.original_url || "").trim();
  if (/^https?:\/\//i.test(direct)) return direct;

  const source = new URL(profileUrl);
  const id = String(entry?.id || "").trim();
  if (!id) return "";

  if (/youtube\.com$/i.test(source.hostname) || /youtu\.be$/i.test(source.hostname)) {
    return `https://www.youtube.com/watch?v=${id}`;
  }
  if (/tiktok\.com$/i.test(source.hostname)) {
    const handle = source.pathname.split("/").find((part) => part.startsWith("@"));
    return handle ? `https://www.tiktok.com/${handle}/video/${id}` : "";
  }
  if (/instagram\.com$/i.test(source.hostname)) {
    const shortcode = String(entry?.shortcode || id).trim();
    return shortcode ? `https://www.instagram.com/reel/${shortcode}/` : "";
  }
  const raw = String(entry?.url || "").trim();
  return /^https?:\/\//i.test(raw) ? raw : "";
}

async function discoverProfileShorts(profileUrl, options = {}) {
  const discoveryLimit = Math.max(10, Math.min(100, Number(options.discovery_limit || 50)));
  const selectTop = Math.max(1, Math.min(25, Number(options.select_top || 15)));
  const args = [
    "--flat-playlist",
    "--dump-json",
    "--playlist-end", String(discoveryLimit),
    "--ignore-errors",
    "--no-warnings",
    "--sleep-requests", "1",
  ];
  if (/tiktok\.com/i.test(profileUrl)) {
    args.push("--extractor-args", "tiktok:api_hostname=api22-normal-c-useast1a.tiktokv.com");
  }
  args.push(profileUrl);

  const result = await run(YTDLP, args, ROOT);
  const rows = String(result.stdout || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const candidates = [];
  const seen = new Set();

  for (let i = 0; i < rows.length; i += 1) {
    let entry;
    try { entry = JSON.parse(rows[i]); } catch { continue; }
    let url = "";
    try { url = profileVideoUrl(entry, profileUrl); } catch { url = ""; }
    if (!url || seen.has(url)) continue;
    try { normalizeUrls([url]); } catch { continue; }
    seen.add(url);
    candidates.push({
      url,
      id: String(entry?.id || ""),
      title: String(entry?.title || entry?.description || "").slice(0, 300),
      views: Number(entry?.view_count || entry?.play_count || 0),
      likes: Number(entry?.like_count || 0),
      duration: Number(entry?.duration || 0),
      order: i,
    });
  }

  const ranked = [...candidates].sort((a, b) => {
    const viewDelta = Number(b.views || 0) - Number(a.views || 0);
    if (viewDelta !== 0) return viewDelta;
    return a.order - b.order;
  });
  const selected = ranked.slice(0, selectTop);
  if (!selected.length) throw new Error(`Aucun format court decouvert depuis ${profileUrl}`);

  return {
    profile_url: profileUrl,
    discovery_limit: discoveryLimit,
    select_top: selectTop,
    discovered_count: candidates.length,
    ranking_basis: candidates.some((x) => Number(x.views || 0) > 0) ? "views_then_order" : "profile_order",
    selected,
    stdout_tail: result.stdout.slice(-3000),
    stderr_tail: result.stderr.slice(-3000),
  };
}

async function processVideoRender(job, processed) {
  if (!VIDEO_RENDER_ENABLED) {
    throw new Error("VIDEO_RENDER disabled locally");
  }

  if (!job?.id || !/^rec[A-Za-z0-9]{14}$/.test(String(job.id))) {
    throw new Error("Invalid VIDEO_RENDER job id");
  }

  if (job.type !== "VIDEO_RENDER") {
    throw new Error(`Invalid VIDEO_RENDER type: ${job.type}`);
  }

  if (job.queue_error) {
    throw new Error(`Queue rejected storyboard: ${job.queue_error}`);
  }

  if (!job.storyboard || typeof job.storyboard !== "object") {
    throw new Error("VIDEO_RENDER storyboard missing");
  }

  const contentId = String(job.options?.content_id || "").trim();

  if (!/^rec[A-Za-z0-9]{14}$/.test(contentId)) {
    throw new Error("Invalid VIDEO_RENDER content_id");
  }

  if (!existsSync(PROJECT_ROOT)) {
    throw new Error(`HIBOU project root missing: ${PROJECT_ROOT}`);
  }

  if (!existsSync(VIDEO_BINDING)) {
    throw new Error(`ComfyUI binding missing: ${VIDEO_BINDING}`);
  }

  const runtime = await ensureCanonicalVideoRuntimes(job);
  const masterScript = VIDEO_MASTER_SCRIPT;

  const preflightScript = path.join(
    PROJECT_ROOT,
    "scripts",
    "video-local-preflight.mjs",
  );

  if (!existsSync(masterScript)) {
    throw new Error(`video-master missing: ${masterScript}`);
  }

  if (!existsSync(preflightScript)) {
    throw new Error(`video preflight missing: ${preflightScript}`);
  }

  const dir = path.join(
    VIDEO_OUTPUT_ROOT,
    safePart(job.id),
  );

  mkdirSync(dir, { recursive: true });

  const storyboardPath = path.join(dir, "storyboard.json");
  const pipelineStatePath = path.join(dir, "pipeline-run.json");
  const masterPath = path.join(dir, "master.mp4");

  const incomingStoryboard = stableStoryboard(job.storyboard);
  let existingStoryboard = null;

  if (existsSync(storyboardPath)) {
    try {
      existingStoryboard = stableStoryboard(
        JSON.parse(readFileSync(storyboardPath, "utf8")),
      );
    } catch {
      existingStoryboard = null;
    }
  }

  if (
    existingStoryboard &&
    !jsonEqual(existingStoryboard, incomingStoryboard)
  ) {
    throw new Error(
      "VIDEO_RENDER storyboard changed for an existing job id; create a new queue job",
    );
  }

  writeFileSync(
    storyboardPath,
    JSON.stringify(incomingStoryboard, null, 2) + "\n",
    "utf8",
  );

  if (existsSync(pipelineStatePath) && existingStoryboard) {
    try {
      const pipeline = JSON.parse(
        readFileSync(pipelineStatePath, "utf8"),
      );
      const source = pipeline?.inputs?.source;
      const samePath =
        source?.type === "file" &&
        path.resolve(String(source.path || "")) === path.resolve(storyboardPath);

      if (samePath && source.sha256 !== sha256(storyboardPath)) {
        source.sha256 = sha256(storyboardPath);
        pipeline.retry_migration = {
          reason: "volatile_storyboard_export_timestamp_removed",
          migrated_at: new Date().toISOString(),
        };
        writeFileSync(
          pipelineStatePath,
          JSON.stringify(pipeline, null, 2) + "\n",
          "utf8",
        );
        log("VIDEO_RENDER retry state migrated", {
          job: job.id,
          pipeline_state: pipelineStatePath,
        });
      }
    } catch (error) {
      throw new Error(
        `Cannot migrate VIDEO_RENDER retry state: ${error?.message || error}`,
      );
    }
  }

  const productionMode = job.options?.preview_mode === true
    ? "preview"
    : "final";

  const remoteHumanDecisions =
    job.options?.human_candidate_decisions &&
    typeof job.options.human_candidate_decisions === "object" &&
    !Array.isArray(job.options.human_candidate_decisions)
      ? job.options.human_candidate_decisions
      : null;
  let humanSelectionResume = false;

  if (remoteHumanDecisions) {
    if (productionMode !== "final") {
      throw new Error(
        "VIDEO_RENDER human candidate decisions require FINAL mode",
      );
    }
    if (
      remoteHumanDecisions.schema !==
      "HIBOU_HUMAN_IMAGE_SELECTION_V1"
    ) {
      throw new Error(
        "VIDEO_RENDER human candidate decisions schema invalid",
      );
    }
    if (String(remoteHumanDecisions.content_id || "") !== contentId) {
      throw new Error(
        "VIDEO_RENDER human candidate decisions content mismatch",
      );
    }

    const reviewPath = path.join(
      dir,
      "images",
      "candidate-review.json",
    );
    if (!existsSync(reviewPath)) {
      throw new Error(
        "VIDEO_RENDER local candidate review missing for resume",
      );
    }
    const localReview = JSON.parse(readFileSync(reviewPath, "utf8"));
    const localFingerprint = String(
      localReview?.review_fingerprint_sha256 || "",
    ).trim().toLowerCase();
    const suppliedFingerprint = String(
      remoteHumanDecisions.review_fingerprint_sha256 || "",
    ).trim().toLowerCase();

    if (
      !/^[0-9a-f]{64}$/.test(localFingerprint) ||
      suppliedFingerprint !== localFingerprint
    ) {
      throw new Error(
        "VIDEO_RENDER remote human selection fingerprint mismatch",
      );
    }

    const decisionsPath = path.join(
      dir,
      "images",
      "candidate-decisions.json",
    );
    writeFileSync(
      decisionsPath,
      JSON.stringify(remoteHumanDecisions, null, 2) + "\n",
      "utf8",
    );
    humanSelectionResume = true;
    log("VIDEO_RENDER remote human candidate decisions staged", {
      job: job.id,
      content_id: contentId,
      review_fingerprint_sha256: localFingerprint,
      decisions_path: decisionsPath,
    });
  }
  const candidatesPerScene = productionMode === "preview"
    ? 1
    : Math.max(
        1,
        Math.min(3, Number(job.options?.candidates_per_scene || 3)),
      );

  state.current_job = job.id;

  log("VIDEO_RENDER started", {
    job: job.id,
    content_id: contentId,
    dir,
    binding: VIDEO_BINDING,
    runtime_commit: runtime.commit,
    runtime_refreshed: runtime.refreshed,
    production_mode: productionMode,
    candidates_per_scene: candidatesPerScene,
  });

  await reportVideoProgress(job, "Running", {
    local_path: dir,
  });

  const preflight = spawnSync(
    process.execPath,
    [preflightScript, "--require-ready"],
    {
      cwd: PROJECT_ROOT,
      stdio: "inherit",
      windowsHide: true,
      shell: false,
      env: process.env,
    },
  );

  if (preflight.status !== 0) {
    throw new Error(
      `video preflight failed with status ${preflight.status}`,
    );
  }

  if (!humanSelectionResume) {
    await ensureComfyUIReady();
  } else {
    log("VIDEO_RENDER human-selection resume skips ComfyUI wake-up", {
      job: job.id,
      content_id: contentId,
    });
  }

  const maxScenes = Math.max(
    1,
    Math.min(25, Number(job.options?.max_scenes || 20)),
  );

  const regenAttempts = Math.max(
    0,
    Math.min(2, Number(job.options?.regen_attempts || 1)),
  );

  const args = [
    masterScript,
    `--storyboard=${storyboardPath}`,
    `--binding=${VIDEO_BINDING}`,
    `--output=${dir}`,
    `--max-scenes=${maxScenes}`,
    `--regen-attempts=${regenAttempts}`,
    `--production-mode=${productionMode}`,
    `--candidates-per-scene=${candidatesPerScene}`,
  ];

  const stylePath = String(
    process.env.HIBOU_VIDEO_STYLE || "",
  ).trim();

  if (stylePath && existsSync(stylePath)) {
    args.push(`--style=${stylePath}`);
  }

  const assetGraphPath = String(
    process.env.HIBOU_VIDEO_ASSET_GRAPH || "",
  ).trim();

  if (assetGraphPath && existsSync(assetGraphPath)) {
    args.push(`--asset-graph=${assetGraphPath}`);
  }

  const reuseFromJobId = String(
    job.options?.reuse_from_job_id || "",
  ).trim();
  const reuseIntegrity = {
    requested: Boolean(reuseFromJobId),
    parent_worker: job.reuse_lineage?.parent_worker || null,
    current_worker: WORKER_ID,
    worker_match: null,
    expected_master_sha256: job.reuse_lineage?.parent_result_sha256 || null,
    result_declared_master_sha256: null,
    actual_master_sha256: null,
    result_job_match: false,
    result_content_match: false,
    result_hash_verified: false,
    file_hash_verified: false,
    airtable_hash_verified: null,
    hash_verified: false,
  };
  if (reuseFromJobId) {
    if (
      !/^rec[A-Za-z0-9]{14}$/.test(reuseFromJobId) ||
      reuseFromJobId === String(job.id)
    ) {
      throw new Error("Invalid VIDEO_RENDER reuse_from_job_id");
    }

    const expectedParentWorker = String(
      job.reuse_lineage?.parent_worker || "",
    ).trim();
    if (expectedParentWorker) {
      reuseIntegrity.worker_match = expectedParentWorker === WORKER_ID;
      if (!reuseIntegrity.worker_match) {
        throw new Error(
          `VIDEO_RENDER reuse parent belongs to another worker: ${expectedParentWorker}`,
        );
      }
    }

    const previousRoot = path.join(
      VIDEO_OUTPUT_ROOT,
      safePart(reuseFromJobId),
    );
    if (!existsSync(previousRoot)) {
      throw new Error(
        `VIDEO_RENDER reuse-from output missing: ${previousRoot}`,
      );
    }

    const expectedParentHash = String(
      job.reuse_lineage?.parent_result_sha256 || "",
    ).trim().toLowerCase();

    const previousResultPath = path.join(
      previousRoot,
      "_hibou_video_result.json",
    );
    if (!existsSync(previousResultPath)) {
      throw new Error(
        `VIDEO_RENDER reuse parent result missing for integrity verification: ${previousResultPath}`,
      );
    }

    let previousResult;
    try {
      previousResult = JSON.parse(
        readFileSync(previousResultPath, "utf8"),
      );
    } catch (error) {
      throw new Error(
        `VIDEO_RENDER reuse parent result unreadable: ${error?.message || error}`,
      );
    }

    reuseIntegrity.result_job_match =
      String(previousResult?.job || "") === reuseFromJobId;
    reuseIntegrity.result_content_match =
      String(previousResult?.content_id || "") === contentId;
    if (
      !reuseIntegrity.result_job_match ||
      !reuseIntegrity.result_content_match
    ) {
      throw new Error(
        "VIDEO_RENDER reuse parent result identity mismatch",
      );
    }

    const declaredParentHash = String(
      previousResult?.master_sha256 || "",
    ).trim().toLowerCase();
    reuseIntegrity.result_declared_master_sha256 =
      declaredParentHash || null;
    if (!/^[0-9a-f]{64}$/.test(declaredParentHash)) {
      throw new Error(
        "VIDEO_RENDER reuse parent result has invalid master hash",
      );
    }

    const previousMasterPath = path.join(
      previousRoot,
      "master.mp4",
    );
    if (!existsSync(previousMasterPath)) {
      throw new Error(
        `VIDEO_RENDER reuse parent master missing for integrity verification: ${previousMasterPath}`,
      );
    }
    const actualParentHash = sha256(previousMasterPath).toLowerCase();
    reuseIntegrity.actual_master_sha256 = actualParentHash;
    reuseIntegrity.result_hash_verified =
      declaredParentHash === actualParentHash;
    reuseIntegrity.file_hash_verified =
      reuseIntegrity.result_hash_verified;

    if (expectedParentHash) {
      reuseIntegrity.airtable_hash_verified =
        expectedParentHash === actualParentHash &&
        expectedParentHash === declaredParentHash;
    }

    reuseIntegrity.hash_verified =
      reuseIntegrity.result_hash_verified &&
      reuseIntegrity.airtable_hash_verified !== false;

    if (!reuseIntegrity.hash_verified) {
      throw new Error(
        "VIDEO_RENDER reuse parent master hash mismatch",
      );
    }

    args.push(`--reuse-from=${previousRoot}`);
    log("VIDEO_RENDER incremental reuse requested", {
      job: job.id,
      reuse_from_job_id: reuseFromJobId,
      previous_root: previousRoot,
      production_mode: productionMode,
      reuse_integrity: reuseIntegrity,
    });
  }

  const renderOutcome = await new Promise((resolveRender, rejectRender) => {
    const renderClientId = `hibou:${job.id}:${state.worker_session}`;
    const child = spawn(process.execPath, args, {
      cwd: PROJECT_ROOT,
      stdio: "inherit",
      windowsHide: true,
      shell: false,
      env: {
        ...process.env,
        HIBOU_VIDEO_CLIENT_ID: renderClientId,
        HIBOU_VIDEO_QUEUE_JOB_ID: job.id,
      },
    });

    state.render_pid = child.pid || null;
    state.render_client_id = renderClientId;
    state.render_started_at = new Date().toISOString();
    state.last_video_heartbeat_at = state.render_started_at;

    const heartbeat = setInterval(() => {
      const progress = pipelineHeartbeatSnapshot(dir);
      const heartbeatAt = new Date().toISOString();
      state.last_video_heartbeat_at = heartbeatAt;
      reportVideoProgress(job, "Running", {
        local_path: dir,
        heartbeat: true,
        result: {
          schema: "HIBOU_VIDEO_RENDER_HEARTBEAT_V1",
          heartbeat_at: heartbeatAt,
          worker: WORKER_ID,
          worker_session: state.worker_session,
          worker_pid: process.pid,
          render_pid: child.pid || null,
          render_client_id: state.render_client_id || null,
          current_stage: state.cancel_request ? "cancelling" : progress.current_stage,
          completed_stages: progress.completed_stages,
          failed_stages: progress.failed_stages,
        },
      }).catch((error) => {
        log("VIDEO_RENDER heartbeat failed", {
          job: job.id,
          error: String(error?.message || error).slice(0, 1000),
        });
      });
    }, 30000);

    let cancellation = null;
    let cancellationCheckInFlight = false;
    const controls = setInterval(async () => {
      if (!VIDEO_REMOTE_CANCEL_ENABLED || cancellation || cancellationCheckInFlight) return;
      cancellationCheckInFlight = true;
      try {
        const control = await fetchVideoControl(job.id);
        if (control && cancellationMatchesOwnedChild(job, child, control)) {
          cancellation = {
            control,
            termination: await terminateOwnedRender(job, child, control),
          };
        }
      } catch (error) {
        log("VIDEO_RENDER control check failed", {
          job: job.id,
          error: String(error?.message || error).slice(0, 1000),
        });
      } finally {
        cancellationCheckInFlight = false;
      }
    }, 5000);

    child.once("error", (error) => {
      clearInterval(heartbeat);
      clearInterval(controls);
      state.render_pid = null;
      state.render_started_at = null;
      state.render_client_id = null;
      rejectRender(error);
    });
    child.once("exit", (code, signal) => {
      clearInterval(heartbeat);
      clearInterval(controls);
      state.render_pid = null;
      state.render_started_at = null;
      if (cancellation) {
        state.render_client_id = null;
        resolveRender({ code: Number(code ?? 1), signal: signal || null, cancellation });
        return;
      }
      if (signal) {
        state.render_client_id = null;
        rejectRender(new Error(`video-master terminated by signal ${signal}`));
        return;
      }
      state.render_client_id = null;
      resolveRender({ code: Number(code ?? 1), signal: null, cancellation: null });
    });
  });

  if (renderOutcome.cancellation) {
    const control = renderOutcome.cancellation.control;
    const finalStatus = control.state === "supersede_requested" ? "Superseded" : "Cancelled";
    const result = {
      schema: "HIBOU_VIDEO_RENDER_CANCELLATION_V1",
      job: job.id,
      content_id: contentId,
      worker: WORKER_ID,
      worker_session: state.worker_session,
      request_id: String(control.request_id || ""),
      requested_state: control.state,
      termination: renderOutcome.cancellation.termination,
      cancelled_at: new Date().toISOString(),
      human_review_required: true,
      publication_authorized: false,
      paid_fallback: false,
    };
    writeFileSync(
      path.join(dir, "_hibou_video_cancelled.json"),
      JSON.stringify(result, null, 2) + "\n",
      "utf8",
    );
    await reportVideoProgress(job, finalStatus, { local_path: dir, result });
    processed.add(job.id);
    saveProcessed(processed);
    const failedJobs = loadFailedJobs();
    delete failedJobs[job.id];
    saveFailedJobs(failedJobs);
    state.current_job = null;
    state.cancel_request = null;
    log("VIDEO_RENDER cancellation completed", {
      job: job.id,
      status: finalStatus,
      request_id: result.request_id,
      forced: Boolean(result.termination?.forced),
    });
    return;
  }

  const renderStatus = Number(renderOutcome.code ?? 1);
  if (renderStatus !== 0) {
    const detail = pipelineFailureDetail(dir);
    throw new Error(
      `video-master failed with status ${renderStatus};${detail || " stage=unknown"}`,
    );
  }

  const waitingSelectionPath = path.join(
    dir,
    "awaiting-human-selection.json",
  );
  if (existsSync(waitingSelectionPath)) {
    let waiting;
    try {
      waiting = JSON.parse(
        readFileSync(waitingSelectionPath, "utf8"),
      );
    } catch (error) {
      throw new Error(
        `VIDEO_RENDER human-selection checkpoint unreadable: ${error?.message || error}`,
      );
    }
    if (
      waiting?.schema !== "HIBOU_VIDEO_MASTER_WAITING_HUMAN_SELECTION_V1" ||
      waiting?.status !== "WAITING_HUMAN_SELECTION"
    ) {
      throw new Error(
        "VIDEO_RENDER invalid human-selection checkpoint schema",
      );
    }

    const candidateReviewPath = String(
      waiting.candidate_review || "",
    ).trim();
    let reviewFingerprint = null;
    if (candidateReviewPath && existsSync(candidateReviewPath)) {
      try {
        const review = JSON.parse(
          readFileSync(candidateReviewPath, "utf8"),
        );
        reviewFingerprint =
          /^[0-9a-f]{64}$/i.test(
            String(review?.review_fingerprint_sha256 || ""),
          )
            ? String(review.review_fingerprint_sha256).toLowerCase()
            : null;
      } catch {}
    }

    const pausedResult = {
      schema: "HIBOU_VIDEO_RENDER_WAITING_HUMAN_SELECTION_V1",
      status: "WAITING_HUMAN_SELECTION",
      job: job.id,
      content_id: contentId,
      worker: WORKER_ID,
      worker_session: state.worker_session,
      local_root: dir,
      candidate_review: candidateReviewPath || null,
      candidate_review_html: waiting.candidate_review_html || null,
      review_fingerprint_sha256: reviewFingerprint,
      decisions_path: waiting.decisions_path || null,
      scene_count: Number(waiting.scene_count || 0),
      resume_same_job: true,
      images_will_be_reused: true,
      human_review_required: true,
      publication_authorized: false,
      paused_at: new Date().toISOString(),
    };

    await reportVideoProgress(job, "Paused", {
      local_path: dir,
      result: pausedResult,
    });

    const failedJobs = loadFailedJobs();
    delete failedJobs[job.id];
    saveFailedJobs(failedJobs);

    state.current_job = null;
    state.render_pid = null;
    state.render_client_id = null;
    state.cancel_request = null;

    log("VIDEO_RENDER waiting for human candidate selection", {
      job: job.id,
      content_id: contentId,
      scene_count: pausedResult.scene_count,
      candidate_review: pausedResult.candidate_review,
      decisions_path: pausedResult.decisions_path,
    });
    return;
  }

  if (!existsSync(masterPath)) {
    throw new Error(
      `video-master completed without master.mp4: ${masterPath}`,
    );
  }

  const masterStat = statSync(masterPath);

  if (!masterStat.isFile() || masterStat.size <= 0) {
    throw new Error("master.mp4 is empty");
  }

  const resultSha256 = sha256(masterPath);

  let incrementalRetouch = {
    requested: Boolean(reuseFromJobId),
    reuse_from_job_id: reuseFromJobId || null,
    plan_available: false,
    changed_scene_ids: [],
    invalidated_stages: [],
    cache_seed: null,
  };
  const incrementalPlanPath = path.join(dir, "incremental-retouch-plan.json");
  if (existsSync(incrementalPlanPath)) {
    try {
      const plan = JSON.parse(readFileSync(incrementalPlanPath, "utf8"));
      incrementalRetouch = {
        ...incrementalRetouch,
        plan_available: true,
        plan_sha256: sha256(incrementalPlanPath),
        changed_scene_ids: Array.isArray(plan.changed_scene_ids)
          ? plan.changed_scene_ids.slice(0, 50)
          : [],
        invalidated_stages: Array.isArray(plan.invalidated_stages)
          ? plan.invalidated_stages.slice(0, 50)
          : [],
      };
    } catch {}
  }
  
  if (existsSync(pipelineStatePath)) {
    try {
      const pipeline = JSON.parse(readFileSync(pipelineStatePath, "utf8"));
      incrementalRetouch.cache_seed =
        pipeline?.incremental_retouch?.cache_seed || null;
    } catch {}
  }

  const result = {
    schema: "HIBOU_VIDEO_RENDER_RESULT_V2",
    job: job.id,
    content_id: contentId,
    worker: WORKER_ID,
    output_dir: dir,
    master_path: masterPath,
    master_sha256: resultSha256,
    master_bytes: masterStat.size,
    production_mode: productionMode,
    candidates_per_scene: candidatesPerScene,
    reuse_from_job_id: reuseFromJobId || null,
    reuse_lineage: job.reuse_lineage || null,
    reuse_integrity: reuseIntegrity,
    incremental_retouch: incrementalRetouch,
    human_review_required: true,
    publication_authorized: false,
    runtime_commit: runtime.commit,
    runtime_master_sha256: state.runtime_master_sha256 || "",
    runtime_voice_sha256: state.runtime_voice_sha256 || "",
    completed_at: new Date().toISOString(),
  };

  writeFileSync(
    path.join(dir, "_hibou_video_result.json"),
    JSON.stringify(result, null, 2) + "\n",
    "utf8",
  );

  await reportVideoProgress(job, "Completed", {
    local_path: masterPath,
    result_sha256: resultSha256,
    result,
  });

  processed.add(job.id);
  saveProcessed(processed);

  state.processed += 1;
  state.current_job = null;

  log("VIDEO_RENDER completed", {
    job: job.id,
    content_id: contentId,
    master: masterPath,
    sha256: resultSha256,
    bytes: masterStat.size,
  });
}

async function processJob(job, processed) {
  if (!job.id) throw new Error("Job sans id");
  const allowedTypes = ["DOWNLOAD_VIDEO", "DOWNLOAD_BATCH", "DOWNLOAD_PROFILE_TOP_SHORTS"];
  if (!allowedTypes.includes(job.type)) throw new Error(`Type refusé: ${job.type}`);
  const urls = normalizeUrls(job.urls);
  if (!urls.length) throw new Error("Aucune URL");
  const concurrent = safePart(job.concurrent || "concurrent");
  const jobName = safePart(job.id);
  const dir = path.join(ROOT, "competitors", concurrent, jobName);

  state.current_job = job.id;
  log("Job started", { job: job.id, type: job.type, urls: urls.length, dir });
  await reportProgress(job, "Running", { local_path: dir });

  const runs = [];
  let discovery = null;

  if (job.type === "DOWNLOAD_PROFILE_TOP_SHORTS") {
    if (urls.length !== 1) throw new Error("Un job profil doit contenir une seule URL de profil");
    discovery = await discoverProfileShorts(urls[0], job.options || {});
    log("Profile discovery completed", { job: job.id, discovered: discovery.discovered_count, selected: discovery.selected.length, ranking: discovery.ranking_basis });
    for (const item of discovery.selected) {
      try {
        const runResult = await downloadOne(item.url, dir, job.options || {});
        runs.push({ ...runResult, selected_metadata: item, ok: true });
      } catch (error) {
        const message = String(error?.message || error).slice(0, 3000);
        runs.push({ url: item.url, selected_metadata: item, ok: false, error: message });
        log("Profile item skipped", { job: job.id, url: item.url, error: message.slice(0, 800) });
      }
    }
  } else {
    for (const url of urls) runs.push({ ...(await downloadOne(url, dir, job.options || {})), ok: true });
  }

  const files = walk(dir);
  const videos = files.filter((f) => /\.(mp4|mkv|webm|mov)$/i.test(f));
  if (!videos.length) throw new Error("Aucun fichier video non vide produit pour ce job");
  const hashes = videos.map((file) => ({
    file: path.relative(ROOT, file),
    sha256: sha256(file),
    bytes: statSync(file).size,
  }));
  const result = {
    schema: "HIBOU_LOCAL_RESULT_V2",
    job: job.id,
    worker: WORKER_ID,
    output_dir: dir,
    video_count: videos.length,
    total_files: files.length,
    videos: hashes,
    discovery,
    runs,
    completed_at: new Date().toISOString(),
  };
  writeFileSync(path.join(dir, "_hibou_result.json"), JSON.stringify(result, null, 2), "utf8");
  processed.add(job.id);
  saveProcessed(processed);
  state.processed += 1;
  state.current_job = null;
  await reportProgress(job, "Completed", { local_path: dir, video_count: videos.length, bytes: hashes.reduce((sum, item) => sum + Number(item.bytes || 0), 0), completed_at: result.completed_at });
  log("Job completed", { job: job.id, videos: videos.length, dir });
}

async function tick() {
  if (!EXECUTION_ENABLED) {
    state.status = "paused";
    return false;
  }

  const approvedJobs = loadApprovedJobs();

  if (!VIDEO_RENDER_ENABLED) {
    if (!APPROVED_JOB_ID && approvedJobs.size === 0) {
      state.status = "waiting_local_job_approval";
      return false;
    }
  }

  const processed = loadProcessed();
  const failed = loadFailedJobs();
  const now = Date.now();

  const retryEligible = (job) => {
    if (!job?.id || processed.has(job.id)) return false;

    const info = failed[job.id];

    if (!info) return true;

    const retryAfter = Number(info.retry_after || 0);
    return retryAfter > 0 && retryAfter <= now;
  };

  let job = null;

  if (VIDEO_RENDER_ENABLED) {
    try {
      const videoJobs = await fetchVideoQueue();
      job = videoJobs.find(retryEligible) || null;
    } catch (error) {
      log("VIDEO_RENDER queue fetch failed", {
        error: String(error?.message || error).slice(0, 1000),
      });
    }
  }

  if (!job) {
    if (APPROVED_JOB_ID || approvedJobs.size > 0) {
      const jobs = await fetchQueue();

      job = jobs.find((x) => {
        const approved = x.id === APPROVED_JOB_ID || approvedJobs.has(x.id);
        return approved && retryEligible(x);
      }) || null;
    }
  }

  if (!job) {
    state.status =
      VIDEO_RENDER_ENABLED
        ? "waiting_for_job"
        : "waiting_local_job_approval";

    return false;
  }

  state.status = "running";

  try {
    if (job.type === "VIDEO_RENDER") {
      await processVideoRender(job, processed);
    } else {
      await processJob(job, processed);
    }
  } catch (error) {
    const fullMessage = String(error?.stack || error);
    const message = fullMessage.length > 6000
      ? fullMessage.slice(0, 1200) + "\n--- worker error tail ---\n" + fullMessage.slice(-4600)
      : fullMessage;

    state.last_error = message;
    state.current_job = null;

    log("Job failed", {
      job: job?.id,
      type: job?.type,
      error: message,
    });

    let failureDiagnostic = null;
    try {
      if (job?.type === "VIDEO_RENDER") {
        failureDiagnostic = buildVideoFailureDiagnostic(job, message);
        await reportVideoProgress(job, "Error", {
          error: message,
          local_path: failureDiagnostic.local_root || undefined,
          result: failureDiagnostic,
        });
      } else {
        await reportProgress(job, "Error", {
          error: message,
        });
      }
    } catch (reportError) {
      log("Failure report failed", {
        job: job?.id,
        error: String(
          reportError?.message || reportError,
        ).slice(0, 1000),
      });
    }

    const latestFailed = loadFailedJobs();
    const prev = latestFailed[job.id] || {};
    const attempts = Number(prev.attempts || 0) + 1;

    latestFailed[job.id] = {
      attempts,
      last_error: message.slice(0, 1500),
      failed_at: new Date().toISOString(),
      resume_stage: failureDiagnostic?.resume_plan?.resume_stage || null,
      resume_plan_path: failureDiagnostic?.resume_plan_path || null,
      resume_execution_performed: false,
      retry_after:
        Date.now() +
        (attempts >= 2
          ? 6 * 60 * 60 * 1000
          : 60 * 1000),
    };

    saveFailedJobs(latestFailed);

    if (ONCE) throw error;
  }

  return true;
}
function healthServer() {
  const port = Number(process.env.HIBOU_WORKER_HEALTH_PORT || 8765);
  const server = createServer((req, res) => {
    if (req.url !== "/health") { res.writeHead(404); res.end("not found"); return; }
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({
      ...state,
      media_root: ROOT,
      queue_url: QUEUE_URL,
      report_url: REPORT_URL,
      report_token_present: Boolean(REPORT_TOKEN),
      video_queue_url: VIDEO_QUEUE_URL,
      video_render_enabled: VIDEO_RENDER_ENABLED,
      video_remote_cancel_enabled: VIDEO_REMOTE_CANCEL_ENABLED,
      video_cancel_grace_ms: VIDEO_CANCEL_GRACE_MS,
      cancel_request: state.cancel_request || null,
      video_autostart_comfyui: VIDEO_AUTOSTART_COMFYUI,
      video_project_root: PROJECT_ROOT,
      video_binding: VIDEO_BINDING,
      video_binding_exists: existsSync(VIDEO_BINDING),
      video_output_root: VIDEO_OUTPUT_ROOT,
      video_master_script: VIDEO_MASTER_SCRIPT,
      video_master_script_exists: existsSync(VIDEO_MASTER_SCRIPT),
      chatterbox_batch_script: CHATTERBOX_BATCH_SCRIPT,
      chatterbox_batch_script_exists: existsSync(CHATTERBOX_BATCH_SCRIPT),
      runtime_commit: state.runtime_commit || null,
      worker_self_update_schema: WORKER_SELF_UPDATE_SCHEMA,
      worker_self_update_enabled: WORKER_SELF_UPDATE_ENABLED,
      worker_runtime_commit: state.worker_runtime_commit || null,
      worker_self_update_pending: Boolean(state.worker_self_update_pending),
      worker_source: WORKER_SOURCE,
      worker_source_sha256: state.worker_source_sha256 || null,
      runtime_master_sha256: state.runtime_master_sha256 || null,
      runtime_voice_sha256: state.runtime_voice_sha256 || null,
      runtime_comfy_start_sha256: state.runtime_comfy_start_sha256 || null,
      runtime_voice_duration_qc_sha256: state.runtime_voice_duration_qc_sha256 || null,
      runtime_resume_plan_sha256: state.runtime_resume_plan_sha256 || null,
      runtime_resume_plan_path: state.runtime_resume_plan_path || null,
      poll_ms: POLL_MS,
      execution_enabled: EXECUTION_ENABLED,
      approved_job_id: APPROVED_JOB_ID || null,
      approved_manifest_count: loadApprovedJobs().size,
      processed_jobs: [...loadProcessed()],
      failed_jobs: loadFailedJobs(),
      now: new Date().toISOString(),
    }));
  });
  server.listen(port, "127.0.0.1", () => log("Health endpoint", { url: `http://127.0.0.1:${port}/health` }));
}

function localDiagnostic() {
  const check = (command, args = ["--version"]) => {
    const r = spawnSync(command, args, { encoding: "utf8", windowsHide: true, shell: false });
    return {
      available: r.status === 0,
      command: [command, ...args].join(" "),
      version: String(r.stdout || r.stderr || "").split(/\r?\n/)[0].trim(),
    };
  };
  const python = process.platform === "win32"
    ? [check("py", ["-3.11", "--version"]), check("python", ["--version"])]
    : [check("python3.11", ["--version"]), check("python3", ["--version"])];
  const nvidia = spawnSync("nvidia-smi", [
    "--query-gpu=name,memory.total,driver_version",
    "--format=csv,noheader,nounits",
  ], { encoding: "utf8", windowsHide: true, shell: false });
  const gpus = nvidia.status === 0
    ? String(nvidia.stdout || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
        const [name, memoryTotalMiB, driverVersion] = line.split(",").map((x) => x.trim());
        return { name, memory_total_mib: Number(memoryTotalMiB), memory_total_gib: Math.round((Number(memoryTotalMiB) / 1024) * 10) / 10, driver_version: driverVersion };
      })
    : [];
  const maxVramGiB = gpus.reduce((max, gpu) => Math.max(max, Number(gpu.memory_total_gib || 0)), 0);
  const videoProfile = maxVramGiB >= 12 ? "comfortable"
    : maxVramGiB >= 8 ? "low_vram_sequential"
    : maxVramGiB > 0 ? "lightweight_or_remote"
    : "gpu_not_detected";
  return {
    schema: "HIBOU_GITHUB_WORKER_DIAGNOSTIC_V2",
    generated_at: new Date().toISOString(),
    worker: WORKER_ID,
    media_root: ROOT,
    queue_url: QUEUE_URL,
    execution_enabled: EXECUTION_ENABLED,
    node: { available: true, version: process.version },
    ffmpeg: check("ffmpeg"),
    ytdlp: check(YTDLP),
    python_candidates: python,
    nvidia_smi_available: nvidia.status === 0,
    gpus,
    video_profile: videoProfile,
    video_autostart_comfyui: VIDEO_AUTOSTART_COMFYUI,
    recommended_first_step: videoProfile === "low_vram_sequential"
      ? "Chatterbox one scene, then ComfyUI local with FP8/low-VRAM profile and sequential candidates"
      : "Run the dedicated video preflight before model installation",
    network_tested: false,
    queue_fetched: false,
    downloads_performed: false,
  };
}

async function main() {
  if (DIAGNOSTIC) {
    process.stdout.write(JSON.stringify(localDiagnostic(), null, 2) + "\n");
    return;
  }
  if (!acquireWorkerLock()) {
    state.status = "duplicate_instance";
    return;
  }
  state.status = EXECUTION_ENABLED ? "running" : "paused";
  log("Hibou GitHub worker starting", { worker: WORKER_ID, root: ROOT, once: ONCE, execution_enabled: EXECUTION_ENABLED, approved_job_id: APPROVED_JOB_ID || null, approved_manifest_count: loadApprovedJobs().size });
  healthServer();
  if (ONCE) {
    await tick();
    state.status = "stopped";
    setTimeout(() => process.exit(0), 200);
    return;
  }
  for (;;) {
    try { await tick(); }
    catch (error) {
      state.last_error = String(error?.stack || error);
      log("Poll failed", { error: state.last_error.slice(0, 3000) });
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
}

main().catch((error) => {
  state.status = "crashed";
  state.last_error = String(error?.stack || error);
  log("Fatal", { error: state.last_error });
  process.exit(1);
});
