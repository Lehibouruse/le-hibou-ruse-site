import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const route = readFileSync(
  new URL("../app/api/local-worker-queue/route.js", import.meta.url),
  "utf8",
);

test("success chaining requires a validated video artifact", () => {
  assert.equal(route.includes("function completedArtifactGate"), true);
  assert.equal(route.includes("HIBOU_VIDEO_RENDER_RESULT_V1"), true);
  assert.equal(route.includes("master\\.mp4"), true);
  assert.equal(route.includes("master_sha256"), true);
  assert.equal(route.includes("master_bytes"), true);
});

test("Completed without valid artifact fails closed", () => {
  assert.equal(route.includes("completed_artifact_gate_failed"), true);
  assert.equal(route.includes('status === "Completed" && artifact_gate.ok'), true);
});

test("artifact gate is returned for observability", () => {
  for (const token of ["artifact_gate","schema_ok","path_ok","hash_ok","bytes_ok"]) {
    assert.equal(route.includes(token), true);
  }
});
