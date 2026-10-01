import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const worker = readFileSync(
  new URL("../scripts/hibou-github-worker.mjs", import.meta.url),
  "utf8",
);

test("failure resume planner is downloaded from the exact video runtime commit", () => {
  assert.match(worker, /scripts\/video-resume-plan\.mjs/);
  assert.match(worker, /scripts\/video-voice-duration-qc\.mjs/);
  assert.match(worker, /HIBOU_VIDEO_RESUME_PLAN_V1/);
  assert.match(worker, /HIBOU_VOICE_DURATION_QC_V1/);
  assert.match(worker, /diagnostic-runtime/);
  assert.match(worker, /runtime_resume_plan_sha256/);
});

test("video failure diagnostic invokes planning only and never resume execution", () => {
  assert.match(worker, /function buildVideoFailureDiagnostic/);
  assert.match(worker, /HIBOU_VIDEO_RENDER_FAILURE_DIAGNOSTIC_V1/);
  assert.match(worker, /_hibou_video_resume_plan\.json/);
  assert.match(worker, /_hibou_video_failure_diagnostic\.json/);
  assert.match(worker, /resume_planner_executed: false/);
  assert.match(worker, /resume_execution_performed: false/);
  assert.match(worker, /execution_performed: false/);
  assert.doesNotMatch(
    worker,
    /buildVideoFailureDiagnostic[\s\S]{0,7000}Statut:\s*"Pending"/,
  );
});

test("future video failures report resume summary while publication stays locked", () => {
  assert.match(
    worker,
    /failureDiagnostic = buildVideoFailureDiagnostic\(job, message\)/,
  );
  assert.match(
    worker,
    /result: failureDiagnostic/,
  );
  assert.match(
    worker,
    /resume_stage: failureDiagnostic\?\.resume_plan\?\.resume_stage \|\| null/,
  );
  assert.match(worker, /human_review_required: true/);
  assert.match(worker, /publication_authorized: false/);
  assert.match(worker, /paid_fallback: false/);
});

test("worker health exposes diagnostic runtime identity without changing execution gates", () => {
  assert.match(worker, /runtime_resume_plan_path/);
  assert.match(worker, /runtime_resume_plan_sha256/);
  assert.match(worker, /runtime_voice_duration_qc_sha256/);
  assert.match(worker, /HIBOU_LOCAL_EXECUTION_ENABLED/);
  assert.match(worker, /HIBOU_VIDEO_RENDER_ENABLED/);
});
