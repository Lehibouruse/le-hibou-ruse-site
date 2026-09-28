import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const worker = readFileSync(
  new URL("../scripts/hibou-github-worker.mjs", import.meta.url),
  "utf8",
);

test("ComfyUI readiness requires a real CUDA device, not HTTP 200 alone", () => {
  assert.match(worker, /function assessComfySystemStats/);
  assert.match(worker, /type === "cuda" \|\| name\.startsWith\("cuda:"\)/);
  assert.match(worker, /reason: "cuda_device_missing"/);
  assert.match(worker, /reason: "cuda_vram_below_project_floor"/);
  assert.match(worker, /reason: "cuda_ready"/);
  assert.match(worker, /stats = await response\.json\(\)/);
  assert.match(worker, /\.\.\.assessComfySystemStats\(stats\)/);
  assert.doesNotMatch(
    worker,
    /async function comfyReady[\s\S]{0,500}return response\.ok/,
  );
});

test("ComfyUI autostart keeps polling CUDA health and exposes the final failure reason", () => {
  assert.match(worker, /const initialHealth = await comfyHealth\(endpoint\)/);
  assert.match(worker, /let lastHealth = initialHealth/);
  assert.match(worker, /lastHealth = await comfyHealth\(endpoint\)/);
  assert.match(worker, /if \(lastHealth\.ready\)/);
  assert.match(worker, /Health gate:/);
  assert.match(worker, /did not become CUDA-ready within 180 seconds/);
});

test("ComfyUI health gate remains loopback-only and does not introduce a CPU or paid fallback", () => {
  assert.match(worker, /ComfyUI endpoint must remain loopback-only/);
  assert.doesNotMatch(worker, /cpu_fallback_enabled\s*:\s*true/);
  assert.doesNotMatch(worker, /paid_fallback\s*:\s*true/);
});
