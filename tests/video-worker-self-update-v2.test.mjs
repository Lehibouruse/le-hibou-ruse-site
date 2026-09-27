import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const worker = readFileSync(new URL("../scripts/hibou-github-worker.mjs", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/local-worker-queue/route.js", import.meta.url), "utf8");

test("worker self-update v2 overwrites managed source then verifies installed hash", () => {
  assert.match(worker, /HIBOU_GITHUB_WORKER_SELF_UPDATE_V2/);
  assert.match(worker, /HIBOU_WORKER_BUILD_20260927_V2/);
  assert.match(worker, /writeFileSync\(target, source, "utf8"\)/);
  assert.match(worker, /installedHash !== remoteHash/);
  assert.match(worker, /X-Hibou-Worker-Build/);
});

test("queue logs authenticated worker build marker for remote verification", () => {
  assert.match(route, /x-hibou-worker-build/);
  assert.match(route, /HIBOU_WORKER_POLL/);
  assert.match(route, /runtime_commit: RUNTIME_COMMIT/);
});
