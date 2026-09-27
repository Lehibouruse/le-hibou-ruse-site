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
const VIDEO_QUEUE_URL =
  process.env.HIBOU_VIDEO_QUEUE_URL ||
  "https://d4d5d6.com/api/local-worker-queue";

const VIDEO_RENDER_ENABLED =
  String(process.env.HIBOU_VIDEO_RENDER_ENABLED || "")
    .trim()
    .toLowerCase() === "true";

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
  worker: WORKER_ID,
  status: "starting",
  queue_mode: "github-public-readonly+authenticated-video-render",
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
    const message = String(info?.error || "unknown stage error").slice(0, 1800);
    return ` stage=${stageName}; error=${message}`;
  } catch {
    return "";
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

  const startScript = path.join(
    PROJECT_ROOT,
    "scripts",
    "video-start-comfyui-windows.ps1",
  );

  if (!existsSync(startScript)) {
    throw new Error(`ComfyUI start script missing: ${startScript}`);
  }

  const url = new URL(endpoint);
  const port = Number(url.port || 8188);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(`Invalid ComfyUI port: ${url.port}`);
  }

  log("Starting ComfyUI automatically", { endpoint, port });

  const child = spawn(
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
    {
      cwd: PROJECT_ROOT,
      windowsHide: true,
      shell: false,
      detached: true,
      stdio: "ignore",
      env: process.env,
    },
  );
  child.unref();

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (await comfyReady(endpoint)) {
      log("ComfyUI ready", { endpoint });
      return { endpoint, started: true };
    }
    await sleep(2000);
  }

  throw new Error(`ComfyUI did not become ready within 120 seconds: ${endpoint}`);
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

  const masterScript = path.join(
    PROJECT_ROOT,
    "scripts",
    "video-master.mjs",
  );

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

  state.current_job = job.id;

  log("VIDEO_RENDER started", {
    job: job.id,
    content_id: contentId,
    dir,
    binding: VIDEO_BINDING,
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

  await ensureComfyUIReady();

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

  const render = spawnSync(
    process.execPath,
    args,
    {
      cwd: PROJECT_ROOT,
      stdio: "inherit",
      windowsHide: true,
      shell: false,
      env: process.env,
    },
  );

  if (render.status !== 0) {
    const detail = pipelineFailureDetail(dir);
    throw new Error(
      `video-master failed with status ${render.status};${detail || " stage=unknown"}`,
    );
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

  const result = {
    schema: "HIBOU_VIDEO_RENDER_RESULT_V1",
    job: job.id,
    content_id: contentId,
    worker: WORKER_ID,
    output_dir: dir,
    master_path: masterPath,
    master_sha256: resultSha256,
    master_bytes: masterStat.size,
    human_review_required: true,
    publication_authorized: false,
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
    const message = String(
      error?.stack || error,
    ).slice(0, 6000);

    state.last_error = message;
    state.current_job = null;

    log("Job failed", {
      job: job?.id,
      type: job?.type,
      error: message,
    });

    try {
      if (job?.type === "VIDEO_RENDER") {
        await reportVideoProgress(job, "Error", {
          error: message,
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
      video_autostart_comfyui: VIDEO_AUTOSTART_COMFYUI,
      video_project_root: PROJECT_ROOT,
      video_binding: VIDEO_BINDING,
      video_binding_exists: existsSync(VIDEO_BINDING),
      video_output_root: VIDEO_OUTPUT_ROOT,
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
