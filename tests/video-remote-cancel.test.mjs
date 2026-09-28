import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const worker=readFileSync(new URL("../scripts/hibou-github-worker.mjs",import.meta.url),"utf8");
const route=readFileSync(new URL("../app/api/local-worker-queue/route.js",import.meta.url),"utf8");

test("remote cancel is feature-flagged off by default and scoped to current owned child",()=>{
  assert.match(worker,/HIBOU_VIDEO_REMOTE_CANCEL_ENABLED/);
  assert.match(worker,/cancellationMatchesOwnedChild/);
  assert.match(worker,/state\.current_job !== job\.id/);
  assert.match(worker,/state\.render_pid\) !== Number\(child\.pid/);
  assert.match(worker,/expected_worker_session/);
  assert.match(worker,/control\.schema !== "HIBOU_VIDEO_RENDER_CONTROL_V1"/);
  assert.match(worker,/!expectedSession \|\| expectedSession !== state\.worker_session/);
  assert.match(worker,/!expectedWorker \|\| expectedWorker !== WORKER_ID/);
  assert.match(worker,/requestId\.length > 240/);
  assert.match(worker,/renderStartedAtMs/);
});

test("Windows cancellation terminates only the selected PID tree and forces only after grace",()=>{
  assert.match(worker,/taskkill.*"\/PID".*"\/T"/s);
  assert.match(worker,/VIDEO_CANCEL_GRACE_MS/);
  assert.match(worker,/taskkill.*"\/PID".*"\/T".*"\/F"/s);
  assert.match(worker,/forced = true/);
});

test("cancel and supersede finish without entering normal retry/error path",()=>{
  assert.match(worker,/HIBOU_VIDEO_RENDER_CANCELLATION_V1/);
  assert.match(worker,/finalStatus = control\.state === "supersede_requested" \? "Superseded" : "Cancelled"/);
  assert.match(worker,/processed\.add\(job\.id\)/);
  assert.match(worker,/delete failedJobs\[job\.id\]/);
});

test("queue API exposes explicit controls only behind the feature flag",()=>{
  assert.match(route,/HIBOU_VIDEO_REMOTE_CANCEL_ENABLED/);
  assert.match(route,/HIBOU_VIDEO_RENDER_CONTROL_V1/);
  assert.match(route,/Cancel requested/);
  assert.match(route,/Supersede requested/);
  assert.match(route,/cancel_requested/);
  assert.match(route,/supersede_requested/);
  assert.doesNotMatch(route,/OR\(\{Statut\}='Cancel requested',\{Statut\}='Superseded'\)/);
  assert.match(route,/remote_cancel_enabled/);
  assert.match(route,/remote_cancel_disabled/);
  assert.match(route,/control_consumed_request_id/);
  assert.match(route,/active_worker_session/);
  assert.match(route,/cancel_terminal_provenance_mismatch/);
  assert.match(route,/requestId === consumedRequestId/);
  assert.match(route,/expectedWorkerSession/);
});

test("ComfyUI cancel is scoped by unique queue client id and never clears unrelated prompts",()=>{
  assert.match(worker,/HIBOU_VIDEO_CLIENT_ID/);
  assert.match(worker,/hibou:\$\{job\.id\}:\$\{state\.worker_session\}/);
  assert.match(worker,/comfyQueueClient\(item\) === id/);
  assert.match(worker,/JSON\.stringify\(\{ delete: pendingIds \}\)/);
  assert.doesNotMatch(worker,/JSON\.stringify\(\{ clear: true \}\)/);
});
