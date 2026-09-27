import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const worker=readFileSync(new URL("../scripts/hibou-github-worker.mjs",import.meta.url),"utf8");
const launcher=readFileSync(new URL("../scripts/start-hibou-video-stack.ps1",import.meta.url),"utf8");

test("video worker can autostart ComfyUI only on loopback",()=>{
  assert.match(worker,/HIBOU_VIDEO_AUTOSTART_COMFYUI/);
  assert.match(worker,/ComfyUI endpoint must remain loopback-only/);
  assert.match(worker,/video-start-comfyui-windows\.ps1/);
  assert.match(worker,/new URL\("\/system_stats", endpoint\)/);
  assert.match(worker,/await ensureComfyUIReady\(\)/);
  assert.match(worker,/Automatic ComfyUI start is Windows-only/);
});

test("one-command video launcher persists required local gates",()=>{
  assert.match(launcher,/HIBOU_LOCAL_EXECUTION_ENABLED" "true"/);
  assert.match(launcher,/HIBOU_VIDEO_RENDER_ENABLED" "true"/);
  assert.match(launcher,/HIBOU_VIDEO_AUTOSTART_COMFYUI" "true"/);
  assert.match(launcher,/HIBOU_PROJECT_ROOT/);
  assert.match(launcher,/HIBOU_VIDEO_BINDING/);
  assert.match(launcher,/HIBOU_VIDEO_OUTPUT_ROOT/);
});

test("video launcher verifies authenticated queue before starting worker",()=>{
  assert.match(launcher,/Authorization = "Bearer \$Token"/);
  assert.match(launcher,/HIBOU_VIDEO_RENDER_QUEUE_V2/);
  assert.match(launcher,/Queue VIDEO_RENDER inaccessible/);
  assert.match(launcher,/Invoke-RestMethod/);
});

test("video launcher never prints the secret token",()=>{
  assert.doesNotMatch(launcher,/Write-Host[^\n]*\$Token/);
  assert.doesNotMatch(launcher,/Write-Output[^\n]*\$Token/);
  assert.doesNotMatch(launcher,/ConvertTo-Json[^\n]*\$Token/);
});

test("video launcher makes the worker persistent at Windows login",()=>{
  assert.match(launcher,/LeHibouWorker\.cmd/);
  assert.match(launcher,/GetFolderPath\("Startup"\)/);
  assert.match(launcher,/start-hibou-video-stack\.runtime\.ps1/);
  assert.match(launcher,/raw\.githubusercontent\.com\/Lehibouruse\/le-hibou-ruse-site\/\$RuntimeCommit/);
  assert.doesNotMatch(launcher,/le-hibou-ruse-site\/main\/scripts\/hibou-github-worker\.mjs/);
});
