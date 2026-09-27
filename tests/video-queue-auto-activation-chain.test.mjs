import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const route = readFileSync(
  new URL("../app/api/local-worker-queue/route.js", import.meta.url),
  "utf8",
);

test("queue can auto-activate exactly one prepared job when worker is ready", () => {
  assert.match(route, /async function autoActivateWhenWorkerReady/);
  assert.match(route, /auto_start_when_worker_ready === true/);
  assert.match(route, /eligible\.length !== 1/);
  assert.match(route, /worker_ready_and_queue_empty/);
  assert.match(route, /Statut: "Pending"/);
});

test("worker-ready auto activation requires an authenticated worker session and empty queue", () => {
  assert.match(route, /worker_session_required/);
  assert.match(route, /queue_not_empty/);
  assert.match(route, /activeVideoJobs\(\)/);
});

test("successful completion can chain exactly one prepared successor", () => {
  assert.match(route, /async function autoChainAfterSuccess/);
  assert.match(route, /auto_start_after_success === true/);
  assert.match(route, /auto_start_after_job_id/);
  assert.match(route, /predecessor_completed/);
});

test("error or running states never trigger success chaining", () => {
  assert.match(route, /const success_chain = status === "Completed"/);
  assert.match(route, /predecessor_not_completed/);
});

test("automation preserves human review, no publication and no paid fallback", () => {
  const occurrences = (route.match(/publication_authorized: false/g) || []).length;
  const paid = (route.match(/paid_fallback: false/g) || []).length;
  assert.ok(occurrences >= 3);
  assert.ok(paid >= 3);
});


test("human-selection resume requires explicit fingerprint-bound decisions", () => {
  assert.match(route, /function humanSelectionResumePayload/);
  assert.match(route, /resume_human_selection !== true/);
  assert.match(route, /HIBOU_HUMAN_IMAGE_SELECTION_V1/);
  assert.match(route, /human_selection_fingerprint_mismatch/);
  assert.match(route, /human_selection_content_mismatch/);
  assert.match(route, /human_selection_decision_row_invalid/);
});

test("human-selection resume is unique, queue-safe and never confused with ordinary auto-start", () => {
  assert.match(route, /async function autoResumeHumanSelection/);
  assert.match(route, /ambiguous_human_selection_resume_jobs/);
  assert.match(route, /HUMAN_SELECTION_RESUME_SCHEDULED/);
  assert.match(route, /const human_selection_resume = await autoResumeHumanSelection/);
  assert.ok(
    route.indexOf("autoResumeHumanSelection(request)") <
      route.indexOf("autoActivateWhenWorkerReady(request)"),
  );
  assert.match(route, /isHumanSelectionPause\(record\)/);
  assert.match(route, /isRepairResumePreparedPause\(record\)/);
});

test("queue forwards human decisions only after a validated resume scheduling record", () => {
  assert.match(route, /human_candidate_decisions:/);
  assert.match(route, /HIBOU_VIDEO_RENDER_HUMAN_SELECTION_RESUME_V1/);
  assert.match(route, /options\.human_candidate_decisions/);
  assert.match(route, /publication_authorized: false/);
});


test("resume normalizes human decisions before forwarding them", () => {
  assert.match(route, /const normalizedRows = \{\}/);
  assert.match(route, /candidate_id: candidateId/);
  assert.match(route, /note: cut\(decision\.note \|\| "", 1000\)/);
  assert.match(route, /publication_authorized: false/);
  assert.match(route, /normalized_options:/);
  assert.match(route, /"Options JSON": JSON\.stringify\(decision\.normalized_options\)/);
});


test("prepared repair pause is excluded from worker-ready and success-chain automation", () => {
  assert.match(route, /function isRepairResumePreparedPause/);
  const occurrences = (
    route.match(/isRepairResumePreparedPause\(record\)/g) || []
  ).length;
  assert.ok(occurrences >= 2);
  assert.match(route, /requires_separate_render_start === true/);
});
