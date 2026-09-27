import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const worker = readFileSync(
  new URL("../scripts/hibou-github-worker.mjs", import.meta.url),
  "utf8",
);

test("VIDEO_RENDER retries remove volatile storyboard export timestamps", () => {
  assert.match(worker, /function stableStoryboard/);
  assert.match(worker, /delete clone\.content\.exported_at/);
  assert.match(worker, /volatile_storyboard_export_timestamp_removed/);
  assert.match(worker, /VIDEO_RENDER retry state migrated/);
});

test("VIDEO_RENDER retries fail closed if storyboard semantics change", () => {
  assert.match(worker, /VIDEO_RENDER storyboard changed for an existing job id/);
  assert.match(worker, /jsonEqual\(existingStoryboard, incomingStoryboard\)/);
});

test("VIDEO_RENDER failures report the exact failed pipeline stage", () => {
  assert.match(worker, /function pipelineFailureDetail/);
  assert.match(worker, /info\?\.status === "ERROR"/);
  assert.match(worker, /stage=\$\{stageName\}/);
  assert.match(worker, /pipelineFailureDetail\(dir\)/);
});
