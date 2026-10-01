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

test("worker heartbeat derives image voice and render unit progress from written artifacts", () => {
  assert.match(worker, /function heartbeatUnitProgress/);
  assert.match(worker, /stage === "images"/);
  assert.match(worker, /image-plan\.json/);
  assert.match(worker, /batch-manifest\.json/);
  assert.match(worker, /unit: "image_candidate"/);
  assert.match(worker, /stage === "voice"/);
  assert.match(worker, /voice-scenes/);
  assert.match(worker, /unit: "voice_scene"/);
  assert.match(worker, /stage === "render"/);
  assert.match(worker, /\.video-render-cache/);
  assert.match(worker, /unit: "scene_clip"/);
  assert.match(worker, /visual_ready: visualReady/);
});

test("worker heartbeat includes stage timing and unit progress", () => {
  assert.match(worker, /stage_started_at: progress\.stage_started_at/);
  assert.match(worker, /stage_elapsed_seconds: progress\.stage_elapsed_seconds/);
  assert.match(worker, /stage_progress: progress\.stage_progress/);
  assert.match(worker, /Math\.round\(\(Date\.now\(\) - startedMs\) \/ 100\) \/ 10/);
});

test("queue sanitizes heartbeat progress before persisting it to Airtable", () => {
  assert.match(route, /const rawStageProgress =/);
  assert.match(route, /completed_units: Math\.max/);
  assert.match(route, /failed_units: Math\.max/);
  assert.match(route, /Math\.min\(100, Number\(rawStageProgress\.percent\)\)/);
  assert.match(route, /visual_ready: rawStageProgress\.visual_ready === true/);
  assert.match(route, /stage_progress: stageProgress/);
  assert.match(route, /stage_elapsed_seconds:/);
});

test("detailed heartbeat remains observational and publication locked", () => {
  assert.match(worker, /HIBOU_VIDEO_RENDER_HEARTBEAT_V1/);
  assert.match(route, /HIBOU_VIDEO_RENDER_HEARTBEAT_V1/);
  assert.match(route, /publication_authorized: false/);
  assert.match(route, /paid_fallback: false/);
});
