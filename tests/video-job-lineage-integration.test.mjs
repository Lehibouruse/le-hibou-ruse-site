import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const route = readFileSync(
  new URL("../app/api/local-worker-queue/route.js", import.meta.url),
  "utf8",
);
const worker = readFileSync(
  new URL("../scripts/hibou-github-worker.mjs", import.meta.url),
  "utf8",
);

test("queue validates reuse lineage before dispatching a VIDEO_RENDER job", () => {
  assert.match(route, /validateReuseLineage/);
  assert.match(route, /TABLES\.localWorkerQueue/);
  assert.match(route, /reuse_parent_lookup_failed/);
  assert.match(route, /job\.reuse_lineage = lineage\.lineage/);
});

test("worker persists production and incremental lineage in the final result", () => {
  assert.match(worker, /HIBOU_VIDEO_RENDER_RESULT_V2/);
  assert.match(worker, /production_mode: productionMode/);
  assert.match(worker, /candidates_per_scene: candidatesPerScene/);
  assert.match(worker, /reuse_from_job_id: reuseFromJobId \|\| null/);
  assert.match(worker, /reuse_lineage: job\.reuse_lineage \|\| null/);
  assert.match(worker, /incremental_retouch: incrementalRetouch/);
  assert.match(worker, /incremental-retouch-plan\.json/);
  assert.match(worker, /plan_sha256: sha256\(incrementalPlanPath\)/);
});
