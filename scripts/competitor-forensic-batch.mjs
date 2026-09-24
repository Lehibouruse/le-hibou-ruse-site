#!/usr/bin/env node
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(process.env.HIBOU_MEDIA_ROOT || path.join(os.homedir(), "HibouMedia"));
const COMPETITORS_ROOT = path.join(ROOT, "competitors");
const SCRIPT = path.resolve("scripts/forensic-package-local.mjs");

function argValue(name, fallback = "") {
  const prefix = `--${name}=`;
  const hit = process.argv.find((arg) => arg.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

function flag(name) {
  return process.argv.includes(`--${name}`);
}

function safeName(value) {
  return String(value || "video")
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "video";
}

function walk(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === "_forensic") continue;
      out.push(...walk(full));
    } else if (/\.(mp4|mov|mkv|webm)$/i.test(name) && st.size > 0) {
      out.push(full);
    }
  }
  return out;
}

function competitorFromPath(file) {
  const rel = path.relative(COMPETITORS_ROOT, file);
  const first = rel.split(path.sep)[0];
  return first || "unknown";
}

function forensicDirFor(file) {
  const jobDir = path.dirname(file);
  return path.join(jobDir, "_forensic", safeName(path.basename(file)));
}

function alreadyDone(outDir) {
  return existsSync(path.join(outDir, "manifest.json"));
}

function runForensic(file, outDir) {
  mkdirSync(outDir, { recursive: true });
  const result = spawnSync(
    process.execPath,
    [SCRIPT, file, outDir],
    { encoding: "utf8", windowsHide: true, shell: false, maxBuffer: 64 * 1024 * 1024 }
  );
  return {
    ok: result.status === 0,
    code: result.status,
    stdout: String(result.stdout || "").trim(),
    stderr: String(result.stderr || "").trim(),
  };
}

function main() {
  const limitRaw = Number(argValue("limit", "1"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : 1;
  const competitorFilter = argValue("competitor", "").trim().toLowerCase();
  const force = flag("force");
  const dryRun = flag("dry-run");

  if (!existsSync(SCRIPT)) {
    throw new Error(`Analyseur introuvable: ${SCRIPT}`);
  }
  if (!existsSync(COMPETITORS_ROOT)) {
    throw new Error(`Corpus local introuvable: ${COMPETITORS_ROOT}`);
  }

  let videos = walk(COMPETITORS_ROOT)
    .map((file) => ({
      file,
      competitor: competitorFromPath(file),
      bytes: statSync(file).size,
      mtimeMs: statSync(file).mtimeMs,
    }))
    .filter((item) => !competitorFilter || item.competitor.toLowerCase().includes(competitorFilter))
    .sort((a, b) => a.mtimeMs - b.mtimeMs || a.file.localeCompare(b.file));

  const skipped = [];
  const candidates = [];
  for (const item of videos) {
    const outDir = forensicDirFor(item.file);
    if (!force && alreadyDone(outDir)) {
      skipped.push({ ...item, reason: "already_analyzed", outDir });
      continue;
    }
    candidates.push({ ...item, outDir });
  }

  const selected = candidates.slice(0, limit);
  const report = {
    schema: "HIBOU_COMPETITOR_FORENSIC_BATCH_V1",
    generated_at: new Date().toISOString(),
    media_root: ROOT,
    competitors_root: COMPETITORS_ROOT,
    filters: {
      competitor: competitorFilter || null,
      limit,
      force,
      dry_run: dryRun,
    },
    discovered_videos: videos.length,
    already_analyzed: skipped.length,
    selected: selected.map((x) => ({
      competitor: x.competitor,
      file: x.file,
      bytes: x.bytes,
      output_dir: x.outDir,
    })),
    results: [],
  };

  if (dryRun) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    return;
  }

  for (const item of selected) {
    const started = Date.now();
    const result = runForensic(item.file, item.outDir);
    report.results.push({
      competitor: item.competitor,
      file: item.file,
      output_dir: item.outDir,
      ok: result.ok,
      elapsed_s: Math.round((Date.now() - started) / 100) / 10,
      stdout_tail: result.stdout.slice(-3000),
      stderr_tail: result.stderr.slice(-3000),
    });
    if (!result.ok) break;
  }

  report.completed = report.results.filter((x) => x.ok).length;
  report.failed = report.results.filter((x) => !x.ok).length;
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");

  if (report.failed) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(String(error?.stack || error));
  process.exitCode = 1;
}
