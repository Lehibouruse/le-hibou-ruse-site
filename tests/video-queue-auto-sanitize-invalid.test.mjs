import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const route = readFileSync(
  new URL("../app/api/local-worker-queue/route.js", import.meta.url),
  "utf8",
);

test("invalid pending VIDEO_RENDER jobs are sanitized server-side", () => {
  assert.match(route, /async function markQueueValidationError/);
  assert.match(route, /queue_validation_failed:/);
  assert.match(route, /HIBOU_VIDEO_RENDER_QUEUE_VALIDATION_V1/);
  assert.match(route, /Statut: "Error"/);
});

test("invalid content ids are not returned to the worker", () => {
  const blockStart = route.indexOf("invalid_content_id");
  assert.ok(blockStart >= 0);
  const block = route.slice(blockStart - 200, blockStart + 500);
  assert.match(block, /markQueueValidationError/);
  assert.match(block, /continue;/);
  assert.doesNotMatch(block, /jobs\.push\(job\)/);
});

test("storyboard validation failures are sanitized and skipped", () => {
  assert.match(route, /const sanitized = await markQueueValidationError/);
  assert.match(route, /queue_sanitization\.push\(sanitized\)/);
  assert.match(route, /continue;/);
});

test("route keeps scanning ordered pending jobs until five valid jobs are built", () => {
  assert.match(route, /const records = sortPendingRecords\(pendingRecords\)/);
  assert.match(route, /if \(jobs\.length >= 5\) break/);
  assert.match(route, /queue_sanitization/);
});

test("sanitization preserves no-publication and no-paid-fallback policy", () => {
  const start = route.indexOf('schema: "HIBOU_VIDEO_RENDER_QUEUE_VALIDATION_V1"');
  assert.ok(start >= 0);
  const block = route.slice(start, start + 600);
  assert.match(block, /publication_authorized: false/);
  assert.match(block, /paid_fallback: false/);
});
