import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
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
const QUEUE_URL = process.env.HIBOU_QUEUE_URL || "https://raw.githubusercontent.com/Lehibouruse/le-hibou-ruse-site/main/config/local-worker-queue.json";
const REPORT_URL = process.env.HIBOU_REPORT_URL || "https://d4d5d6.com/api/local-worker-status";
const REPORT_TOKEN = String(process.env.HIBOU_LOCAL_REPORT_TOKEN || "").trim();
const ONCE = process.argv.includes("--once");
const DIAGNOSTIC = process.argv.includes("--diagnostic");
const EXECUTION_ENABLED = String(process.env.HIBOU_LOCAL_EXECUTION_ENABLED || "").trim().toLowerCase() === "true";
const APPROVED_JOB_ID = String(process.env.HIBOU_LOCAL_APPROVED_JOB_ID || "").trim();
const ALLOWED_HOSTS = new Set([
  "youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be",
  "instagram.com", "www.instagram.com",
  "tiktok.com", "www.tiktok.com", "vm.tiktok.com",
]);

mkdirSync(ROOT, { recursive: true });
mkdirSync(LOG_DIR, { recursive: true });

let state = {
  started_at: new Date().toISOString(),
  worker: WORKER_ID,
  status: "starting",
  queue_mode: "github-public-readonly",
  current_job: null,
  last_error: null,
  processed: 0,
};

function log(message, data = null) {
  const line = `[${new Date().toISOString()}] ${message}${data ? " " + JSON.stringify(data) : ""}`;
  console.log(line);
  appendFileSync(LOG_FILE, line + "\n", "utf8");
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

async function fetchQueue() {
  const response = await fetch(`${QUEUE_URL}?t=${Date.now()}`, { headers: { "User-Agent": "Le-Hibou-ROG-Worker/1.0" } });
  if (!response.ok) throw new Error(`Queue HTTP ${response.status}`);
  const data = await response.json();
  if (!data || !Array.isArray(data.jobs)) throw new Error("Format de queue invalide");
  return data.jobs.filter((job) => job && job.active !== false);
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
async function processJob(job, processed) {
  if (!job.id) throw new Error("Job sans id");
  if (!["DOWNLOAD_VIDEO", "DOWNLOAD_BATCH"].includes(job.type)) throw new Error(`Type refusé: ${job.type}`);
  const urls = normalizeUrls(job.urls);
  if (!urls.length) throw new Error("Aucune URL");
  const concurrent = safePart(job.concurrent || "concurrent");
  const jobName = safePart(job.id);
  const dir = path.join(ROOT, "competitors", concurrent, jobName);

  state.current_job = job.id;
  log("Job started", { job: job.id, urls: urls.length, dir });
  await reportProgress(job, "Running", { local_path: dir });

  const runs = [];
  for (const url of urls) runs.push(await downloadOne(url, dir, job.options || {}));

  const files = walk(dir);
  const videos = files.filter((f) => /\.(mp4|mkv|webm|mov)$/i.test(f));
  const hashes = videos.map((file) => ({
    file: path.relative(ROOT, file),
    sha256: sha256(file),
    bytes: statSync(file).size,
  }));
  const result = {
    schema: "HIBOU_LOCAL_RESULT_V1",
    job: job.id,
    worker: WORKER_ID,
    output_dir: dir,
    video_count: videos.length,
    total_files: files.length,
    videos: hashes,
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
  if (!APPROVED_JOB_ID && approvedJobs.size === 0) {
    state.status = "waiting_local_job_approval";
    return false;
  }
  const processed = loadProcessed();
  const failed = loadFailedJobs();
  const now = Date.now();
  const jobs = await fetchQueue();
  const job = jobs.find((x) => {
    const approved = x.id === APPROVED_JOB_ID || approvedJobs.has(x.id);
    if (!approved || processed.has(x.id)) return false;
    const info = failed[x.id];
    if (!info) return true;
    const retryAfter = Number(info.retry_after || 0);
    return retryAfter > 0 && retryAfter <= now;
  });
  if (!job) return false;
  try {
    await processJob(job, processed);
  } catch (error) {
    const message = String(error?.stack || error).slice(0, 6000);
    state.last_error = message;
    state.current_job = null;
    log("Job failed", { job: job?.id, error: message });
    await reportProgress(job, "Error", { error: message });
    const failed = loadFailedJobs();
    const prev = failed[job.id] || {};
    const attempts = Number(prev.attempts || 0) + 1;
    failed[job.id] = {
      attempts,
      last_error: message.slice(0, 1500),
      failed_at: new Date().toISOString(),
      retry_after: Date.now() + (attempts >= 2 ? 6 * 60 * 60 * 1000 : 60 * 1000),
    };
    saveFailedJobs(failed);
    if (ONCE) throw error;
    // Le job en erreur est temporairement saute afin que le corpus continue.
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
