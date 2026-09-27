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

test("worker requires auditable receipt before pausing without render execution", () => {
  assert.match(worker, /_hibou_video_resume_apply_receipt\.json/);
  assert.match(worker, /HIBOU_VIDEO_RESUME_APPLY_RECEIPT_V1/);
  assert.match(worker, /repair resume receipt validation failed/);
  assert.match(worker, /repair resume receipt reset-stage mismatch/);
  assert.match(worker, /receipt_sha256: sha256\(receiptPath\)/);
  assert.match(worker, /HIBOU_VIDEO_REMOTE_REPAIR_PREPARED_V1/);
  assert.match(worker, /requires_separate_render_start: true/);
  assert.match(worker, /execution_started: false/);
});

test("repair reset never deletes artifacts or caches and pauses before execution", () => {
  assert.match(worker, /artifacts_deleted: false/);
  assert.match(worker, /caches_deleted: false/);
  assert.match(worker, /execution_started_by_reset: false/);
  assert.match(worker, /execution_started: false/);
  assert.match(worker, /requires_separate_render_start: true/);
  assert.match(worker, /human_confirmed: true/);
  assert.match(worker, /publication_authorized: false/);
  assert.match(worker, /reportVideoProgress\(job, "Paused"/);
  assert.match(worker, /prepared_only: true/);
});

test("another failure requires another human scheduling action", () => {
  assert.match(route, /resume_failed_job: false/);
  assert.match(route, /human_confirmed_resume: false/);
  assert.doesNotMatch(worker, /repairResumeApplied[\s\S]{0,1200}Statut:\s*"Pending"/);
});


test("repair preparation returns before ordinary render prerequisites and master launch", () => {
  const processStart = worker.indexOf("async function processVideoRender");
  const processEnd = worker.indexOf("\nasync function tick()", processStart);
  const processBody = worker.slice(processStart, processEnd);

  const prepared = processBody.indexOf(
    "HIBOU_VIDEO_REMOTE_REPAIR_PREPARED_V1",
  );
  const paused = processBody.indexOf(
    'reportVideoProgress(job, "Paused"',
  );
  const preparedReturn = processBody.indexOf(
    "prepared_only: true",
  );
  const binding = processBody.indexOf(
    "ComfyUI binding missing",
  );
  const running = processBody.indexOf(
    'reportVideoProgress(job, "Running"',
  );
  const preflight = processBody.indexOf(
    'preflightScript, "--require-ready"',
  );

  assert.ok(prepared >= 0);
  assert.ok(paused > prepared);
  assert.ok(preparedReturn > paused);
  assert.ok(binding > preparedReturn);
  assert.ok(running > preparedReturn);
  assert.ok(preflight > preparedReturn);
});

test("prepared repair pause is one-shot and excluded from automatic start chains", () => {
  assert.match(route, /function isRepairResumePreparedPause/);
  assert.match(route, /HIBOU_VIDEO_REMOTE_REPAIR_PREPARED_V1/);
  assert.match(route, /repair_resume_request: null/);
  assert.match(route, /repair_resume_prepared_at: now/);
  assert.match(route, /isRepairResumePreparedPause\(record\)/);
  assert.match(route, /requires_separate_render_start: repairPrepared/);
});

test("repair preparation clears local failure backoff but does not mark job processed", () => {
  const processStart = worker.indexOf("async function processVideoRender");
  const processEnd = worker.indexOf("\nasync function tick()", processStart);
  const processBody = worker.slice(processStart, processEnd);
  const preparedBranchStart = processBody.indexOf(
    "HIBOU_VIDEO_REMOTE_REPAIR_PREPARED_V1",
  );
  const preparedReturn = processBody.indexOf(
    "prepared_only: true",
    preparedBranchStart,
  );
  const branch = processBody.slice(preparedBranchStart, preparedReturn + 200);

  assert.match(branch, /delete failedJobs\[job\.id\]/);
  assert.doesNotMatch(branch, /processed\.add\(job\.id\)/);
});


test("worker persists a local prepared-repair marker before Paused report", () => {
  const marker = worker.indexOf("_hibou_video_remote_repair_prepared.json");
  const paused = worker.indexOf('reportVideoProgress(job, "Paused"');
  assert.ok(marker >= 0);
  assert.ok(paused > marker);
  assert.match(worker, /JSON\.stringify\(repairResumeApplied, null, 2\)/);
});


test("prepared repair start has its own independent API and worker gates", () => {
  assert.match(route, /HIBOU_VIDEO_REMOTE_REPAIR_START_ENABLED/);
  assert.match(route, /const REMOTE_REPAIR_START_ENABLED/);
  assert.match(route, /remote_repair_start_disabled/);
  assert.match(worker, /HIBOU_VIDEO_REMOTE_REPAIR_START_ENABLED/);
  assert.match(worker, /const VIDEO_REMOTE_REPAIR_START_ENABLED/);
  assert.match(worker, /remote repair start is disabled locally/);
});

test("preparation clears any preloaded second consent", () => {
  assert.match(route, /start_prepared_repair: false/);
  assert.match(route, /human_confirmed_start: false/);
  assert.match(route, /repair_start_plan_sha256: null/);
  assert.match(route, /repair_start_receipt_sha256: null/);
  assert.match(route, /repair_start_state_file_sha256: null/);
  assert.match(route, /repair_start_request: null/);
});

test("API requires a fresh second human consent and exact prepared hashes", () => {
  assert.match(route, /function repairStartPayload/);
  assert.match(route, /start_prepared_repair !== true/);
  assert.match(route, /human_confirmed_start !== true/);
  assert.match(route, /repair_start_plan_sha_mismatch/);
  assert.match(route, /repair_start_source_state_sha_mismatch/);
  assert.match(route, /repair_start_receipt_sha_mismatch/);
  assert.match(route, /repair_start_state_file_sha_mismatch/);
  assert.match(route, /HIBOU_VIDEO_REPAIR_START_REQUEST_V1/);
});

test("API starts at most one prepared repair and ordinary auto-start still excludes prepared pauses", () => {
  assert.match(route, /async function autoStartPreparedRepair/);
  assert.match(route, /ambiguous_repair_start_jobs/);
  assert.match(route, /HIBOU_VIDEO_RENDER_REPAIR_START_SCHEDULED_V1/);
  assert.match(route, /const repair_start = await autoStartPreparedRepair\(request\)/);
  assert.match(route, /isRepairResumePreparedPause\(record\)/);
  assert.match(route, /remote_repair_start_enabled: REMOTE_REPAIR_START_ENABLED/);
});

test("scheduled start request reaches worker only behind start gate", () => {
  assert.match(route, /repair_start_request:/);
  assert.match(route, /REMOTE_REPAIR_START_ENABLED &&/);
  assert.match(route, /HIBOU_VIDEO_RENDER_REPAIR_START_SCHEDULED_V1/);
  assert.match(route, /HIBOU_VIDEO_REPAIR_START_REQUEST_V1/);
});

test("worker rejects any prepared state or receipt byte change before explicit start", () => {
  assert.match(worker, /_hibou_video_remote_repair_prepared\.json/);
  assert.match(worker, /prepared-repair marker is not startable/);
  assert.match(worker, /prepared repair receipt bytes changed before start/);
  assert.match(worker, /prepared pipeline state changed before explicit start/);
  assert.match(worker, /prepared pipeline state is not eligible for explicit start/);
});

test("worker marks prepared state execution only after second local verification", () => {
  assert.match(worker, /pipeline_status = "REPAIR_EXECUTION_STARTED"/);
  assert.match(worker, /resume_prepared\.execution_started = true/);
  assert.match(worker, /HIBOU_VIDEO_REMOTE_REPAIR_EXECUTION_V1/);
  assert.match(worker, /HIBOU_VIDEO_REMOTE_REPAIR_STARTED_V1/);
  assert.match(worker, /_hibou_video_remote_repair_started\.json/);
  assert.match(worker, /repair_start: repairStartApplied/);
});

test("explicit repair start is auditable and still preserves caches/publication lock", () => {
  assert.match(worker, /prepared_state_sha256:/);
  assert.match(worker, /execution_state_sha256:/);
  assert.match(worker, /prepared_marker_before_sha256:/);
  assert.match(worker, /prepared_marker_after_sha256:/);
  assert.match(worker, /artifacts_deleted: false/);
  assert.match(worker, /caches_deleted: false/);
  assert.match(worker, /human_review_required: true/);
  assert.match(worker, /publication_authorized: false/);
});


test("explicit repair start request is consumed only after hash-bound Running proof", () => {
  assert.match(worker, /repairStartApplied\s*\? \{ result: repairStartApplied \}/);
  assert.match(route, /const repairStartAccepted =/);
  assert.match(route, /status === "Running"/);
  assert.match(route, /body\.heartbeat !== true/);
  assert.match(route, /HIBOU_VIDEO_REMOTE_REPAIR_STARTED_V1/);
  assert.match(route, /repair_start_request_missing_at_acceptance/);
  assert.match(route, /repair_start_acceptance_hash_mismatch:/);
  assert.match(route, /repair_start_request: null/);
  assert.match(route, /repair_start_consumed_at: now/);
  assert.match(route, /repair_start_accepted: repairStartAccepted/);
});

test("repair start acceptance revalidates all four immutable proofs", () => {
  assert.match(route, /\["plan_sha256", "plan_sha256"\]/);
  assert.match(route, /\["source_state_sha256", "source_state_sha256"\]/);
  assert.match(route, /\["receipt_sha256", "receipt_sha256"\]/);
  assert.match(route, /\["state_file_sha256", "prepared_state_sha256"\]/);
  assert.match(route, /expected !== actual/);
});
