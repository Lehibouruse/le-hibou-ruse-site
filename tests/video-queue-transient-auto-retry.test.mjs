import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const route = readFileSync(
  new URL("../app/api/local-worker-queue/route.js", import.meta.url),
  "utf8",
);

test("transient auto-retry is explicitly opt-in and bounded", () => {
  assert.match(route, /auto_retry_transient_errors !== true/);
  assert.match(route, /auto_retry_limit/);
  assert.match(route, /Math\.min\(2/);
  assert.match(route, /retry_limit_reached/);
});

test("retry allowlist covers infrastructure failures but not deterministic QC failures", () => {
  assert.match(route, /ETIMEDOUT/);
  assert.match(route, /ECONNRESET/);
  assert.match(route, /ECONNREFUSED/);
  assert.match(route, /CUDA out of memory/);
  assert.match(route, /orphaned_worker_timeout/);
  assert.match(route, /ComfyUI/);
  assert.doesNotMatch(route, /NO_PASS.*transientPatterns/);
});

test("eligible transient errors are requeued as Pending without terminal timestamp", () => {
  assert.match(route, /Statut: retry\.retry \? "Pending" : status/);
  assert.match(route, /HIBOU_VIDEO_RENDER_TRANSIENT_RETRY_V1/);
  assert.match(route, /status === "Error" && !retry\.retry/);
  assert.match(route, /local_backoff_seconds: 60/);
});

test("completed jobs still chain while retried errors never do", () => {
  assert.match(route, /const success_chain = status === "Completed"/);
  assert.match(route, /predecessor_not_completed/);
});

test("retry metadata preserves no-publication and no-paid-fallback policy", () => {
  const retryBlockStart = route.indexOf('schema: "HIBOU_VIDEO_RENDER_TRANSIENT_RETRY_V1"');
  assert.ok(retryBlockStart >= 0);
  const retryBlock = route.slice(retryBlockStart, retryBlockStart + 800);
  assert.match(retryBlock, /publication_authorized: false/);
  assert.match(retryBlock, /paid_fallback: false/);
});
