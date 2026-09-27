import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const worker = readFileSync(new URL("../scripts/hibou-github-worker.mjs", import.meta.url), "utf8");
const starter = readFileSync(new URL("../scripts/video-start-comfyui-windows.ps1", import.meta.url), "utf8");

test("ComfyUI autostart is commit-pinned and diagnosed", () => {
  assert.match(worker, /video-start-comfyui-windows\.runtime\.ps1/);
  assert.match(worker, /COMFYUI_AUTOSTART_V2/);
  assert.match(worker, /180_000/);
  assert.match(worker, /ComfyUI stderr tail/);
  assert.match(worker, /runtime_comfy_start_sha256/);
});

test("Windows ComfyUI starter cleans stale Hibou process and logs startup", () => {
  assert.match(starter, /COMFYUI_AUTOSTART_V2/);
  assert.match(starter, /Get-CimInstance Win32_Process/);
  assert.match(starter, /ComfyUI\\main\.py/);
  assert.match(starter, /--windows-standalone-build/);
  assert.match(starter, /RedirectStandardOutput/);
  assert.match(starter, /RedirectStandardError/);
  assert.match(starter, /HIBOU_COMFYUI_AUTOSTART_V2/);
});
