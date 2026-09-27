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

test("render heartbeat reads current pipeline stage", () => {
  assert.match(worker, /function pipelineHeartbeatSnapshot/);
  assert.match(worker, /current_stage/);
  assert.match(worker, /completed_stages/);
  assert.match(worker, /failed_stages/);
  assert.match(worker, /pipelineHeartbeatSnapshot\(dir\)/);
});

test("queue persists safe pipeline heartbeat stage metadata", () => {
  assert.match(route, /current_stage: cut\(heartbeatResult\.current_stage/);
  assert.match(route, /completed_stages: Array\.isArray/);
  assert.match(route, /failed_stages: Array\.isArray/);
  assert.match(route, /publication_authorized: false/);
  assert.match(route, /paid_fallback: false/);
});
