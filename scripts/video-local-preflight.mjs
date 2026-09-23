#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { statfsSync } from "node:fs";
import { resolve } from "node:path";
import os from "node:os";

function command(command, args = []) {
  const r = spawnSync(command, args, { encoding: "utf8" });
  return {
    available: r.status === 0,
    status: r.status,
    stdout: String(r.stdout || "").trim(),
    stderr: String(r.stderr || "").trim(),
  };
}

export function parseNvidiaCsv(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [index, name, memoryTotalMiB, memoryFreeMiB, driverVersion] = line.split(",").map(x => x.trim());
      return {
        index: Number(index),
        name,
        memory_total_mib: Number(memoryTotalMiB),
        memory_free_mib: Number(memoryFreeMiB),
        driver_version: driverVersion,
      };
    })
    .filter(gpu => Number.isInteger(gpu.index) && Number.isFinite(gpu.memory_total_mib));
}

export function classify(report, minFreeGiB = 25) {
  const reasons = [];
  if (!report.gpus.length) reasons.push("no_nvidia_gpu");
  if (!report.python_3_11.available) reasons.push("python_3_11_missing");
  if (!report.ffmpeg.available || !report.ffprobe.available) reasons.push("ffmpeg_missing");
  if (report.disk_free_gib < minFreeGiB) reasons.push("low_disk_space");
  return {
    ready_for_model_smoke_test: reasons.length === 0,
    blocking_reasons: reasons,
    policy: reasons.length ? "STOP_BEFORE_MODEL_DOWNLOAD" : "ONE_COMPONENT_AT_A_TIME",
    project_disk_safety_floor_gib: minFreeGiB,
    note: "The disk floor is a Hibou project safety gate, not a vendor-stated model minimum.",
  };
}

export function collectPreflight(root = process.cwd()) {
  const nvidia = command("nvidia-smi", [
    "--query-gpu=index,name,memory.total,memory.free,driver_version",
    "--format=csv,noheader,nounits",
  ]);
  const python311 = command(process.env.HIBOU_PYTHON || "python3.11", ["--version"]);
  const pythonDefault = command("python3", ["--version"]);
  const ffmpeg = command("ffmpeg", ["-version"]);
  const ffprobe = command("ffprobe", ["-version"]);
  const git = command("git", ["--version"]);

  const disk = statfsSync(resolve(root));
  const diskFree = Number(disk.bavail) * Number(disk.bsize);
  const minFreeGiB = Number(process.env.HIBOU_MIN_FREE_GIB || 25);

  const report = {
    schema: "HIBOU_LOCAL_PREFLIGHT_V1",
    generated_at: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
    cpu_count: os.cpus().length,
    ram_total_gib: Number((os.totalmem() / 1024 ** 3).toFixed(2)),
    ram_free_gib: Number((os.freemem() / 1024 ** 3).toFixed(2)),
    disk_free_gib: Number((diskFree / 1024 ** 3).toFixed(2)),
    gpus: nvidia.available ? parseNvidiaCsv(nvidia.stdout) : [],
    nvidia_smi_available: nvidia.available,
    python_3_11: { available: python311.available, version: python311.stdout || python311.stderr },
    python_default: { available: pythonDefault.available, version: pythonDefault.stdout || pythonDefault.stderr },
    ffmpeg: { available: ffmpeg.available, version: ffmpeg.stdout.split("\n")[0] || ffmpeg.stderr.split("\n")[0] },
    ffprobe: { available: ffprobe.available, version: ffprobe.stdout.split("\n")[0] || ffprobe.stderr.split("\n")[0] },
    git: { available: git.available, version: git.stdout || git.stderr },
    network_tested: false,
    model_downloads_performed: false,
    paid_fallback: false,
  };
  return { ...report, decision: classify(report, minFreeGiB) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = collectPreflight();
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (process.argv.includes("--require-ready") && !report.decision.ready_for_model_smoke_test) process.exitCode = 2;
}
