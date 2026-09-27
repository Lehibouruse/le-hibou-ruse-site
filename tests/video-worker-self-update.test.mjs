import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const worker = readFileSync(
  new URL("../scripts/hibou-github-worker.mjs", import.meta.url),
  "utf8",
);

test("worker self-update is driven by authenticated queue runtime_commit", () => {
  assert.match(worker, /maybeSelfUpdateWorker\(\s*data\.runtime_commit/);
  assert.match(worker, /\^\[0-9a-f\]\{40\}\$/);
  assert.match(worker, /RUNTIME_REPO/);
});

test("worker downloads itself from immutable commit, never mutable main", () => {
  assert.match(worker, /raw\.githubusercontent\.com\/\$\{RUNTIME_REPO\}\/\$\{normalized\}\/scripts\/hibou-github-worker\.mjs/);
  assert.doesNotMatch(worker, /raw\.githubusercontent\.com\/Lehibouruse\/le-hibou-ruse-site\/main\/scripts\/hibou-github-worker\.mjs/);
});

test("worker validates candidate before replacing local runtime", () => {
  assert.match(worker, /hibou-github-worker\.candidate\.mjs/);
  assert.match(worker, /\["--check", candidatePath\]/);
  assert.match(worker, /candidate failed node --check/);
  assert.match(worker, /hibou-github-worker\.previous\.mjs/);
});

test("worker self-update replaces only current worker file and schedules clean restart", () => {
  assert.match(worker, /CURRENT_WORKER_PATH = fileURLToPath\(import\.meta\.url\)/);
  assert.match(worker, /writeFileSync\(CURRENT_WORKER_PATH, source, "utf8"\)/);
  assert.match(worker, /state\.status = "self_update_restart"/);
  assert.match(worker, /process\.exit\(75\)/);
});

test("worker self-update can be disabled explicitly", () => {
  assert.match(worker, /HIBOU_WORKER_SELF_UPDATE/);
  assert.match(worker, /WORKER_SELF_UPDATE_ENABLED/);
});
