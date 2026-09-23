#!/usr/bin/env node
import os from "node:os";
import { spawnSync } from "node:child_process";

function run(cmd, args = []) {
  const r = spawnSync(cmd, args, { encoding: "utf8", windowsHide: true });
  if (r.error || r.status !== 0) return null;
  return (r.stdout || "").trim();
}

function gib(bytes) {
  return Math.round((bytes / 1024 ** 3) * 10) / 10;
}

function diskInfo() {
  if (process.platform === "win32") {
    const out = run("powershell.exe", ["-NoProfile", "-Command",
      "$d=(Get-Item .).PSDrive; [pscustomobject]@{Name=$d.Name;FreeGB=[math]::Round($d.Free/1GB,1);UsedGB=[math]::Round($d.Used/1GB,1)} | ConvertTo-Json -Compress"]);
    if (!out) return null;
    try { return JSON.parse(out); } catch { return { raw: out }; }
  }
  const out = run("df", ["-Pk", "."]);
  if (!out) return null;
  const line = out.split(/\r?\n/).filter(Boolean).at(-1);
  const parts = line.trim().split(/\s+/);
  if (parts.length < 4) return { raw: out };
  return {
    filesystem: parts[0],
    total_gb: Math.round((Number(parts[1]) / 1024 / 1024) * 10) / 10,
    used_gb: Math.round((Number(parts[2]) / 1024 / 1024) * 10) / 10,
    free_gb: Math.round((Number(parts[3]) / 1024 / 1024) * 10) / 10,
  };
}

function nvidiaInfo() {
  const out = run("nvidia-smi", [
    "--query-gpu=name,memory.total,memory.free,driver_version",
    "--format=csv,noheader,nounits",
  ]);
  if (!out) return [];
  return out.split(/\r?\n/).filter(Boolean).map((line) => {
    const [name, totalMiB, freeMiB, driver] = line.split(",").map(x => x.trim());
    return {
      name,
      vram_total_mib: Number(totalMiB),
      vram_free_mib: Number(freeMiB),
      driver,
    };
  });
}

function otherGpuInfo() {
  if (process.platform === "win32") {
    const out = run("powershell.exe", ["-NoProfile", "-Command",
      "Get-CimInstance Win32_VideoController | Select-Object Name,AdapterRAM,DriverVersion | ConvertTo-Json -Compress"]);
    if (!out) return null;
    try { return JSON.parse(out); } catch { return { raw: out }; }
  }
  if (process.platform === "darwin") return run("system_profiler", ["SPDisplaysDataType"]);
  return run("sh", ["-lc", "command -v lspci >/dev/null 2>&1 && lspci | grep -Ei 'vga|3d|display' || true"]);
}

const nvidia = nvidiaInfo();
const report = {
  generated_at: new Date().toISOString(),
  platform: process.platform,
  release: os.release(),
  arch: process.arch,
  cpu_model: os.cpus()?.[0]?.model || null,
  cpu_logical: os.cpus()?.length || null,
  ram_total_gib: gib(os.totalmem()),
  ram_free_gib: gib(os.freemem()),
  disk: diskInfo(),
  nvidia,
  other_gpu: nvidia.length ? null : otherGpuInfo(),
  node: process.version,
  python: run(process.platform === "win32" ? "python" : "python3", ["--version"]) || run("python", ["--version"]),
  ffmpeg: run("ffmpeg", ["-version"])?.split(/\r?\n/)[0] || null,
  git: run("git", ["--version"]) || null,
  decision: {
    nvidia_cuda_visible: nvidia.length > 0,
    automatic_model_download_allowed: false,
    reason: nvidia.length
      ? "GPU NVIDIA visible. Review VRAM/free disk and exact workflow requirements before downloading a model."
      : "No NVIDIA CUDA GPU detected. Do not download FLUX/Chatterbox CUDA weights automatically; continue deterministic renderer work only.",
  },
};

process.stdout.write(JSON.stringify(report, null, 2) + "\n");
