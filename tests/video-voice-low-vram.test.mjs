import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const voice = readFileSync(
  new URL("../scripts/chatterbox-storyboard-batch.py", import.meta.url),
  "utf8",
);
const master = readFileSync(
  new URL("../scripts/video-master.mjs", import.meta.url),
  "utf8",
);

test("Chatterbox batch uses a low-VRAM sequential CUDA policy", () => {
  assert.match(voice, /PYTORCH_CUDA_ALLOC_CONF/);
  assert.match(voice, /expandable_segments:True/);
  assert.match(voice, /torch\.cuda\.empty_cache\(\)/);
  assert.match(voice, /gc\.collect\(\)/);
  assert.match(voice, /generate_scene\(/);
});

test("Chatterbox batch retries one CUDA OOM without CPU or cloud fallback", () => {
  assert.match(voice, /CUDA voice generation failed after one cleanup retry/);
  assert.match(voice, /out of memory\|cuda error\|cublas_status_alloc_failed/);
  assert.doesNotMatch(voice, /device\s*=\s*["']cpu["']/);
  assert.match(voice, /no silent CPU\/cloud fallback/);
});

test("Chatterbox batch reports model-load failures explicitly", () => {
  assert.match(voice, /Chatterbox model load failed on \{device\}/);
});

test("video master captures child stdout and stderr tails on failure", () => {
  assert.match(master, /encoding:"utf8"/);
  assert.match(master, /maxBuffer:32\*1024\*1024/);
  assert.match(master, /process\.stderr\.write\(r\.stderr\)/);
  assert.match(master, /String\(r\.stderr\|\|r\.stdout\|\|""\)\.slice\(-12000\)/);
});
