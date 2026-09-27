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

test("repair resume is independently disabled by default on API and worker", () => {
  assert.match(route, /HIBOU_VIDEO_REMOTE_REPAIR_RESUME_ENABLED/);
  assert.match(route, /const REMOTE_REPAIR_RESUME_ENABLED/);
  assert.match(route, /remote_repair_resume_disabled/);
  assert.match(worker, /HIBOU_VIDEO_REMOTE_REPAIR_RESUME_ENABLED/);
  assert.match(worker, /const VIDEO_REMOTE_REPAIR_RESUME_ENABLED/);
  assert.match(worker, /remote repair resume is disabled locally/);
});

test("API schedules repair only after explicit human confirmation and exact failure hashes", () => {
  assert.match(route, /function repairResumePayload/);
  assert.match(route, /HIBOU_VIDEO_RENDER_FAILURE_DIAGNOSTIC_V1/);
  assert.match(route, /resume_failed_job !== true/);
  assert.match(route, /human_confirmed_resume !== true/);
  assert.match(route, /repair_resume_plan_sha_mismatch/);
  assert.match(route, /repair_resume_state_sha_mismatch/);
  assert.match(route, /repair_resume_content_mismatch/);
  assert.match(route, /HIBOU_VIDEO_REPAIR_RESUME_REQUEST_V1/);
  assert.match(route, /publication_authorized: false/);
});

test("API resumes at most one failed repair job and keeps ordinary auto-start separate", () => {
  assert.match(route, /async function autoResumeFailedRepair/);
  assert.match(route, /ambiguous_repair_resume_jobs/);
  assert.match(route, /REPAIR_RESUME_SCHEDULED/);
  assert.match(route, /const repair_resume = await autoResumeFailedRepair\(request\)/);
  assert.ok(
    route.indexOf("autoResumeFailedRepair(request)") <
      route.indexOf("autoActivateWhenWorkerReady(request)"),
  );
  assert.match(route, /remote_repair_resume_enabled: REMOTE_REPAIR_RESUME_ENABLED/);
});

test("scheduled repair request is forwarded to worker only under the server gate", () => {
  assert.match(route, /repair_resume_request:/);
  assert.match(route, /REMOTE_REPAIR_RESUME_ENABLED &&/);
  assert.match(route, /HIBOU_VIDEO_RENDER_REPAIR_RESUME_SCHEDULED_V1/);
  assert.match(route, /HIBOU_VIDEO_REPAIR_RESUME_REQUEST_V1/);
});

test("worker bypasses old local error backoff only for a gated repair request", () => {
  assert.match(worker, /const repairResume =/);
  assert.match(worker, /VIDEO_REMOTE_REPAIR_RESUME_ENABLED &&/);
  assert.match(worker, /HIBOU_VIDEO_REPAIR_RESUME_REQUEST_V1/);
  assert.match(worker, /if \(repairResume\) return true/);
});

test("worker validates local plan hash state hash content stage and human confirmation again", () => {
  assert.match(worker, /remoteRepairResume\.human_confirmed !== true/);
  assert.match(worker, /remote repair resume content mismatch/);
  assert.match(worker, /_hibou_video_resume_plan\.json/);
  assert.match(worker, /repair resume plan hash mismatch/);
  assert.match(worker, /repair resume source-state hash mismatch/);
  assert.match(worker, /repair resume stage mismatch/);
  assert.match(worker, /local resume plan is not eligible for guarded apply/);
});

test("worker applies only through commit-pinned guarded resume-state runtime", () => {
  assert.match(worker, /runtime\.resume_state/);
  assert.match(worker, /--apply/);
  assert.match(worker, /--confirm-plan-sha256=\$\{actualPlanSha\}/);
  assert.match(worker, /HIBOU_VIDEO_RESUME_APPLY_ENABLED: "true"/);
  assert.match(worker, /windowsHide: true/);
  assert.match(worker, /shell: false/);
});

test("worker requires auditable receipt before continuing normal render", () => {
  assert.match(worker, /_hibou_video_resume_apply_receipt\.json/);
  assert.match(worker, /HIBOU_VIDEO_RESUME_APPLY_RECEIPT_V1/);
  assert.match(worker, /repair resume receipt validation failed/);
  assert.match(worker, /repair resume receipt reset-stage mismatch/);
  assert.match(worker, /receipt_sha256: sha256\(receiptPath\)/);
  assert.match(worker, /HIBOU_VIDEO_RENDER_REPAIR_RESUME_APPLIED_V1/);
});

test("repair reset never deletes artifacts or caches and never authorizes publication", () => {
  assert.match(worker, /artifacts_deleted: false/);
  assert.match(worker, /caches_deleted: false/);
  assert.match(worker, /execution_started_by_reset: false/);
  assert.match(worker, /human_confirmed: true/);
  assert.match(worker, /publication_authorized: false/);
  assert.match(worker, /repair_resume: repairResumeApplied/);
});

test("another failure requires another human scheduling action", () => {
  assert.match(route, /resume_failed_job: false/);
  assert.match(route, /human_confirmed_resume: false/);
  assert.doesNotMatch(worker, /repairResumeApplied[\s\S]{0,1200}Statut:\s*"Pending"/);
});
