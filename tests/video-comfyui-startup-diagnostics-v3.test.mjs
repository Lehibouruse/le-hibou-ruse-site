import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const worker = readFileSync(new URL("../scripts/hibou-github-worker.mjs", import.meta.url), "utf8");

test("ComfyUI starter diagnostics are captured synchronously", () => {
  assert.match(worker, /ComfyUI starter failed before readiness polling/);
  assert.match(worker, /ComfyUI starter returned/);
  assert.match(worker, /comfyui-autostart-state\.json/);
  assert.match(worker, /ComfyUI child exited before readiness/);
  assert.match(worker, /starter stderr/);
  assert.match(worker, /starter stdout/);
  assert.match(worker, /ComfyUI child pid/);
});
