import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const BASE_ID = process.env.HIBOU_AIRTABLE_BASE_ID || "appWyUX7TYPNrDbyP";
const TABLE_ID = process.env.HIBOU_LOCAL_WORKER_TABLE_ID || "tbl8VTZsY6uv3z9Y7";
const TOKEN = process.env.AIRTABLE_TOKEN || "";
const ROOT = process.env.HIBOU_MEDIA_ROOT || path.join(os.homedir(), "HibouMedia");
const POLL_MS = Math.max(5000, Number(process.env.HIBOU_WORKER_POLL_MS || 15000));
const WORKER_ID = process.env.HIBOU_WORKER_ID || `ROG-${os.hostname()}`;
const YTDLP = process.env.HIBOU_YTDLP || "yt-dlp";
const LOG_DIR = path.join(process.env.LOCALAPPDATA || ROOT, "LeHibou");
const LOG_FILE = path.join(LOG_DIR, "worker.log");
const ONCE = process.argv.includes("--once");
const DIAGNOSTIC = process.argv.includes("--diagnostic");
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
  current_job: null,
  last_error: null,
  processed: 0,
};

function log(message, data = null) {
  const line = `[${new Date().toISOString()}] ${message}${data ? " " + JSON.stringify(data) : ""}`;
  console.log(line);
  appendFileSync(LOG_FILE, line + "\n", "utf8");
}

function headers() {
  if (!TOKEN) throw new Error("AIRTABLE_TOKEN absent. Lance install-hibou-local-worker.ps1.");
  return { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
}

async function airtable(pathname, options = {}) {
  const response = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${TABLE_ID}${pathname}`, {
    ...options,
    headers: { ...headers(), ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Airtable ${response.status}: ${data?.error?.message || data?.error?.type || "unknown"}`);
  }
  return data;
}

async function patchRecord(id, fields) {
  return airtable(`/${id}`, { method: "PATCH", body: JSON.stringify({ fields }) });
}

async function getRecord(id) {
  return airtable(`/${id}`);
}

function priorityRank(value) {
  const name = typeof value === "object" ? value?.name : value;
  return name === "High" ? 0 : name === "Normal" ? 1 : 2;
}

async function pendingJobs() {
  const params = new URLSearchParams();
  params.set("pageSize", "10");
  params.set("filterByFormula", "AND({Statut}='Pending',OR({Type}='DOWNLOAD_VIDEO',{Type}='DOWNLOAD_BATCH'))");
  const data = await airtable(`?${params}`);
  return (data.records || []).sort((a, b) => {
    const pa = priorityRank(a.fields?.["Priorité"]);
    const pb = priorityRank(b.fields?.["Priorité"]);
    if (pa !== pb) return pa - pb;
    return String(a.fields?.["Créé le"] || "").localeCompare(String(b.fields?.["Créé le"] || ""));
  });
}

function parseOptions(value) {
  try { return JSON.parse(String(value || "{}")); } catch { return {}; }
}

function safePart(value, fallback = "unknown") {
  const cleaned = String(value || fallback)
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return cleaned || fallback;
}

function normalizeUrls(raw) {
  const urls = String(raw || "")
    .split(/\r?\n|,\s*(?=https?:\/\/)/)
    .map((x) => x.trim())
    .filter(Boolean);
  return [...new Set(urls.map((value) => {
    const url = new URL(value);
    if (!ALLOWED_HOSTS.has(url.hostname.toLowerCase())) {
      throw new Error(`Hôte non autorisé: ${url.hostname}`);
    }
    return url.toString();
  }))];
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, windowsHide: true, shell: false });
    let stdout = "", stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (stdout.length > 200000) stdout = stdout.slice(-200000);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      if (stderr.length > 200000) stderr = stderr.slice(-200000);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ code, stdout, stderr });
      else reject(new Error(`${command} exit ${code}\n${stderr.slice(-12000)}`));
    });
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

async function downloadOne(url, dir, options) {
  mkdirSync(dir, { recursive: true });
  const maxHeight = Math.max(360, Math.min(2160, Number(options.max_height || 1080)));
  const subtitleLangs = Array.isArray(options.subtitle_languages) && options.subtitle_languages.length
    ? options.subtitle_languages.join(",")
    : "fr,en";
  const args = [
    "--newline",
    "--no-progress",
    "--windows-filenames",
    "--restrict-filenames",
    "--write-info-json",
    "--write-thumbnail",
    "--convert-thumbnails", "jpg",
    "--write-subs",
    "--write-auto-subs",
    "--sub-langs", subtitleLangs,
    "--sub-format", "srt/best",
    "-f", `bv*[height<=${maxHeight}]+ba/b[height<=${maxHeight}]`,
    "--merge-output-format", "mp4",
    "-o", "%(uploader)s/%(upload_date)s - %(title)s [%(id)s].%(ext)s",
  ];
  if (options.cookies_from_browser) {
    throw new Error("cookies_from_browser refusé en V1 : aucun accès aux cookies du navigateur depuis une commande Airtable");
  }
  if (options.no_playlist !== false) args.push("--no-playlist");
  args.push(url);

  const started = Date.now();
  const result = await run(YTDLP, args, dir);
  return {
    url,
    elapsed_s: Math.round((Date.now() - started) / 100) / 10,
    stdout_tail: result.stdout.slice(-5000),
    stderr_tail: result.stderr.slice(-5000),
  };
}

async function processJob(job) {
  const fields = job.fields || {};
  const urls = normalizeUrls(fields.URLs);
  if (!urls.length) throw new Error("Aucune URL");
  const options = parseOptions(fields["Options JSON"]);
  const concurrent = safePart(fields.Concurrent || "concurrent");
  const jobName = safePart(fields.Job || job.id);
  const dir = path.join(ROOT, "competitors", concurrent, jobName);

  await patchRecord(job.id, {
    "Statut": "Running",
    "Démarré le": new Date().toISOString(),
    "Worker": WORKER_ID,
    "Tentatives": Number(fields.Tentatives || 0) + 1,
    "Erreur": "",
    "Chemin local": dir,
  });

  const owned = await getRecord(job.id);
  const ownedStatus = typeof owned.fields?.Statut === "object" ? owned.fields.Statut?.name : owned.fields?.Statut;
  if (owned.fields?.Worker !== WORKER_ID || ownedStatus !== "Running") {
    throw new Error("Lease local perdue");
  }

  state.current_job = fields.Job || job.id;
  const runs = [];
  for (const url of urls) runs.push(await downloadOne(url, dir, options));

  const files = walk(dir);
  const videos = files.filter((f) => /\.(mp4|mkv|webm|mov)$/i.test(f));
  const hashes = videos.map((file) => ({
    file: path.relative(ROOT, file),
    sha256: sha256(file),
    bytes: statSync(file).size,
  }));
  const digest = createHash("sha256").update(JSON.stringify(hashes)).digest("hex");
  const result = {
    ok: true,
    worker: WORKER_ID,
    root: ROOT,
    output_dir: dir,
    urls,
    video_count: videos.length,
    total_files: files.length,
    videos: hashes,
    runs,
    completed_at: new Date().toISOString(),
  };

  await patchRecord(job.id, {
    "Statut": "Completed",
    "Terminé le": new Date().toISOString(),
    "Chemin local": dir,
    "Résultat JSON": JSON.stringify(result).slice(0, 95000),
    "Hash résultat": digest,
    "Erreur": "",
  });

  state.processed += 1;
  state.current_job = null;
  log("Job completed", { job: fields.Job || job.id, videos: videos.length, dir });
}

async function tick() {
  const jobs = await pendingJobs();
  if (!jobs.length) return false;
  const job = jobs[0];
  try {
    await processJob(job);
  } catch (error) {
    const message = String(error?.stack || error).slice(0, 5000);
    state.last_error = message;
    state.current_job = null;
    log("Job failed", { job: job.fields?.Job || job.id, error: message });
    await patchRecord(job.id, {
      "Statut": "Error",
      "Terminé le": new Date().toISOString(),
      "Worker": WORKER_ID,
      "Erreur": message,
    }).catch(() => {});
  }
  return true;
}

function healthServer() {
  const port = Number(process.env.HIBOU_WORKER_HEALTH_PORT || 8765);
  const server = createServer((req, res) => {
    if (req.url !== "/health") {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({
      ...state,
      media_root: ROOT,
      poll_ms: POLL_MS,
      now: new Date().toISOString(),
    }));
  });
  server.listen(port, "127.0.0.1", () => {
    log("Health endpoint", { url: `http://127.0.0.1:${port}/health` });
  });
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
  const nvidia = spawnSync("nvidia-smi", [
    "--query-gpu=name,memory.total,driver_version",
    "--format=csv,noheader,nounits",
  ], { encoding: "utf8", windowsHide: true, shell: false });
  const gpus = nvidia.status === 0
    ? String(nvidia.stdout || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
        const [name, memoryTotalMiB, driverVersion] = line.split(",").map((x) => x.trim());
        return { name, memory_total_mib: Number(memoryTotalMiB), driver_version: driverVersion };
      })
    : [];
  return {
    schema: "HIBOU_LOCAL_WORKER_DIAGNOSTIC_V1",
    generated_at: new Date().toISOString(),
    worker: WORKER_ID,
    platform: process.platform,
    arch: process.arch,
    media_root: ROOT,
    airtable_token_present: Boolean(TOKEN),
    node: { available: true, version: process.version },
    git: check("git"),
    ytdlp: check(YTDLP),
    ffmpeg: check("ffmpeg"),
    nvidia_smi_available: nvidia.status === 0,
    gpus,
    network_tested: false,
    airtable_tested: false,
    downloads_performed: false,
  };
}

async function main() {
  if (DIAGNOSTIC) {
    process.stdout.write(JSON.stringify(localDiagnostic(), null, 2) + "\n");
    return;
  }
  state.status = "running";
  log("Hibou local worker starting", { worker: WORKER_ID, root: ROOT, once: ONCE });
  healthServer();

  if (ONCE) {
    await tick();
    state.status = "stopped";
    setTimeout(() => process.exit(0), 200);
    return;
  }

  for (;;) {
    try {
      await tick();
    } catch (error) {
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
