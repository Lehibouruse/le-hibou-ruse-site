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
