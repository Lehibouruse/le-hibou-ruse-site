import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const worker = readFileSync(
  new URL("../scripts/hibou-github-worker.mjs", import.meta.url),
  "utf8",
);

test("worker builds structured VIDEO_RENDER failure diagnostics", () => {
  assert.match(worker, /HIBOU_VIDEO_RENDER_FAILURE_DIAGNOSTIC_V1/);
  assert.match(worker, /failed_stage/);
  assert.match(worker, /running_stage/);
  assert.match(worker, /completed_stages/);
  assert.match(worker, /pipeline_state_path/);
  assert.match(worker, /factory_run_path/);
});

test("failure diagnostics expose image QC summaries when available", () => {
  assert.match(worker, /failed_check_counts/);
  assert.match(worker, /dimensions/);
  assert.match(worker, /reason_counts/);
  assert.match(worker, /warning_counts/);
  assert.match(worker, /regeneration_attempts/);
});

test("VIDEO_RENDER failure report sends structured diagnostics to Airtable route", () => {
  assert.match(worker, /structuredVideoFailureDiagnostics\(job, error\)/);
  assert.match(worker, /result: diagnostic/);
  assert.match(worker, /local_path: diagnostic\.output_root/);
});

test("failure diagnostics preserve human review and no automatic publication/fallback", () => {
  const start=worker.indexOf('schema: "HIBOU_VIDEO_RENDER_FAILURE_DIAGNOSTIC_V1"');
  assert.ok(start>=0);
  const block=worker.slice(start,start+2600);
  assert.match(block,/human_review_required: true/);
  assert.match(block,/publication_authorized: false/);
  assert.match(block,/paid_fallback: false/);
});
