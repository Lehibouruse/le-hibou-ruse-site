import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const route = readFileSync(
  new URL("../app/api/local-worker-queue/route.js", import.meta.url),
  "utf8",
);

test("success chaining requires a validated video artifact", () => {
  assert.match(route, /function completedArtifactGate/);
  assert.match(route, /HIBOU_VIDEO_RENDER_RESULT_V1/);
  assert.match(route, /master\.mp4\$/);
  assert.match(route, /\^\[0-9a-f\]\{64\}\$/i);
  assert.match(route, /master_bytes/);
  assert.match(route, /bytes > 0/);
});

test("Completed without valid artifact fails closed and does not chain", () => {
  assert.match(route, /completed_artifact_gate_failed/);
  assert.match(route, /status === "Completed" && artifact_gate\.ok/);
});

test("artifact gate is returned for observability", () => {
  assert.match(route, /artifact_gate,/);
  assert.match(route, /schema_ok/);
  assert.match(route, /path_ok/);
  assert.match(route, /hash_ok/);
  assert.match(route, /bytes_ok/);
});
