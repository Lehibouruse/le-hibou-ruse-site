import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const worker = readFileSync(
  new URL("../scripts/hibou-github-worker.mjs", import.meta.url),
  "utf8",
);
const preflight = readFileSync(
  new URL("../scripts/video-local-preflight.mjs", import.meta.url),
  "utf8",
);

test("worker installs preflight runtime into AppData by deployed commit", () => {
  assert.match(worker, /VIDEO_PREFLIGHT_SCRIPT/);
  assert.match(worker, /video-local-preflight\.runtime\.mjs/);
  assert.match(worker, /scripts\/video-local-preflight\.mjs/);
  assert.match(worker, /HIBOU_LOCAL_PREFLIGHT_V1/);
});

test("preflight entrypoint is portable on Windows", () => {
  assert.match(preflight, /pathToFileURL\(resolve\(process\.argv\[1\]\)\)\.href/);
  assert.doesNotMatch(preflight, /file:\/\/\$\{process\.argv\[1\]\}/);
});

test("VIDEO_RENDER no longer requires local project root for execution", () => {
  assert.doesNotMatch(worker, /HIBOU project root missing/);
  assert.match(worker, /cwd: LOG_DIR/);
  assert.match(worker, /const preflightScript = runtime\.preflight/);
  assert.match(worker, /const masterScript = runtime\.master/);
});

test("downloaded mjs runtimes are syntax checked before installation", () => {
  assert.match(worker, /repoPath\.endsWith\("\.mjs"\)/);
  assert.match(worker, /\["--check", temp\]/);
  assert.match(worker, /Runtime node --check failed/);
});

test("downloaded python runtimes are py_compile checked when Hibou Python exists", () => {
  assert.match(worker, /repoPath\.endsWith\("\.py"\)/);
  assert.match(worker, /HIBOU_PYTHON/);
  assert.match(worker, /\["-m", "py_compile", temp\]/);
  assert.match(worker, /Runtime py_compile failed/);
});
