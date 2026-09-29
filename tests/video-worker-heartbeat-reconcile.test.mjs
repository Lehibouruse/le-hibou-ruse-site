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

test("worker enforces a local single-instance lock", () => {
  assert.match(worker, /hibou-github-worker\.lock/);
  assert.match(worker, /openSync\(WORKER_LOCK_FILE, "wx"\)/);
  assert.match(worker, /Another Hibou worker instance is already alive/);
  assert.match(worker, /process\.kill\(n, 0\)/);
});

test("worker reports render heartbeats from the async video-master child", () => {
  assert.match(worker, /HIBOU_VIDEO_RENDER_HEARTBEAT_V1/);
  assert.match(worker, /setInterval\(\(\) => \{/);
  assert.match(worker, /heartbeat: true/);
  assert.match(worker, /render_pid/);
  assert.match(worker, /spawn\(process\.execPath, args/);
});

test("worker sends its session on queue polls and reports", () => {
  assert.match(worker, /X-Hibou-Worker-Session/);
  assert.match(worker, /worker_session: state\.worker_session/);
  assert.match(worker, /worker_pid: process\.pid/);
});

test("queue heartbeats do not increment attempts", () => {
  assert.match(route, /if \(body\.heartbeat === true\)/);
  assert.match(route, /HIBOU_VIDEO_RENDER_HEARTBEAT_V1/);
  assert.match(route, /else \{\r?\n\s+fields\["D\\u00e9marr\\u00e9 le"\] = now;/);
});

test("queue reconciliation is session-gated and fails stale jobs closed", () => {
  assert.match(route, /x-hibou-worker-session/);
  assert.match(route, /staleAfterMs = 8 \* 60 \* 1000/);
  assert.match(route, /HIBOU_VIDEO_RENDER_ORPHAN_RECONCILIATION_V1/);
  assert.match(route, /orphaned_worker_timeout/);
  assert.match(route, /publication_authorized: false/);
  assert.match(route, /paid_fallback: false/);
});
