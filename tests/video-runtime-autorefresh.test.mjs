import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const worker = readFileSync(
  new URL("../scripts/hibou-github-worker.mjs", import.meta.url),
  "utf8",
);
const route = readFileSync(
  new URL("../app/api/local-worker-queue/route.js", import.meta.url),
  "utf8",
);

test("queue exposes the exact deployed Vercel git commit", () => {
  assert.match(route, /VERCEL_GIT_COMMIT_SHA/);
  assert.match(route, /runtime_commit: RUNTIME_COMMIT/);
  assert.match(route, /\^\[0-9a-f\]\{40\}\$/i);
});

test("worker accepts only full hexadecimal runtime commits", () => {
  assert.match(worker, /function normalizeRuntimeCommit/);
  assert.match(worker, /\^\[0-9a-f\]\{40\}\$/);
  assert.match(worker, /VIDEO_RENDER runtime_commit missing or invalid/);
});

test("worker installs pinned runtimes only under the LeHibou local runtime directory", () => {
  assert.match(worker, /function assertRuntimeTarget/);
  assert.match(worker, /path\.resolve\(LOG_DIR\) \+ path\.sep/);
  assert.match(worker, /runtime target must stay inside/);
});

test("worker downloads runtimes by immutable commit and verifies code markers", () => {
  assert.match(worker, /raw\.githubusercontent\.com\/\$\{RUNTIME_REPO\}\/\$\{commit\}/);
  assert.match(worker, /pathToFileURL\(resolve\(process\.argv\[1\]\)\)\.href/);
  assert.match(worker, /HIBOU_CHATTERBOX_LOAD_ROOT_CAUSE/);
  assert.match(worker, /inspect\.signature\(ChatterboxMultilingualTTS\.from_pretrained\)/);
  assert.match(worker, /Runtime marker missing/);
});

test("worker records exact runtime commit and hashes in completed video results", () => {
  assert.match(worker, /runtime_commit: runtime\.commit/);
  assert.match(worker, /runtime_master_sha256/);
  assert.match(worker, /runtime_voice_sha256/);
});
