import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  pipelineStateFingerprint,
  VIDEO_STAGE_ORDER,
} from "../scripts/video-resume-plan.mjs";
import {
  buildResumeApplyReceipt,
  prepareResumeState,
  RESUME_STATE_SCHEMA,
  validateResumeApply,
} from "../scripts/video-resume-state.mjs";

function state() {
  return {
    schema: "HIBOU_VIDEO_MASTER_RUN_V1",
    pipeline_status: "ERROR",
    stages: {
      storyboard: { status: "PASS" },
      voice: { status: "PASS" },
      images: { status: "PASS" },
      render: { status: "ERROR", error: "fontconfig" },
    },
    stage_history: [
      { stage: "voice", event: "PASS", attempt: 1 },
      { stage: "render", event: "ERROR", attempt: 1 },
    ],
  };
}

function planFor(s, root = "/tmp/hibou") {
  const resumeStage = "voice";
  return {
    schema: "HIBOU_VIDEO_RESUME_PLAN_V1",
    root,
    source_state_sha256: pipelineStateFingerprint(s),
    analysis_only: true,
    execution_performed: false,
    resume_required: true,
    resume_stage: resumeStage,
    stages_to_reset: VIDEO_STAGE_ORDER.slice(
      VIDEO_STAGE_ORDER.indexOf(resumeStage),
    ),
    publication_authorized: false,
  };
}

test("resume state reset removes only stage state and preserves history/caches by policy", () => {
  const original = state();
  const plan = planFor(original);
  const prepared = prepareResumeState({
    state: original,
    plan,
    planSha256: "a".repeat(64),
    preparedAt: "2026-09-27T22:00:00.000Z",
  });

  assert.equal(prepared.schema, RESUME_STATE_SCHEMA);
  assert.equal(prepared.state.stages.storyboard.status, "PASS");
  assert.equal(prepared.state.stages.voice, undefined);
  assert.equal(prepared.state.stages.images, undefined);
  assert.equal(prepared.state.stages.render, undefined);
  assert.equal(prepared.state.pipeline_status, "RESUME_PREPARED");
  assert.equal(prepared.state.resume_prepared.resume_stage, "voice");
  assert.equal(
    prepared.state.resume_prepared.source_state_sha256,
    pipelineStateFingerprint(original),
  );
  assert.equal(prepared.state.resume_history.length, 1);
  assert.equal(prepared.policy.artifacts_deleted, false);
  assert.equal(prepared.policy.caches_deleted, false);
  assert.equal(prepared.policy.execution_started, false);
  assert.equal(prepared.publication_authorized, false);

  assert.equal(original.stages.voice.status, "PASS");
  assert.equal(original.stages.render.status, "ERROR");
});

test("stale resume plan is rejected when pipeline state changes", () => {
  const original = state();
  const plan = planFor(original);
  const changed = structuredClone(original);
  changed.stages.render.error = "different error";

  assert.throws(
    () =>
      prepareResumeState({
        state: changed,
        plan,
        planSha256: "a".repeat(64),
      }),
    /resume plan is stale: pipeline state fingerprint mismatch/,
  );
});

test("resume reset refuses while any stage is RUNNING", () => {
  const original = state();
  original.stages.images = {
    status: "RUNNING",
    started_at: "2026-09-27T22:00:00.000Z",
  };
  const plan = planFor(original);

  assert.throws(
    () =>
      prepareResumeState({
        state: original,
        plan,
        planSha256: "a".repeat(64),
      }),
    /cannot prepare resume while stages are RUNNING: images/,
  );
});

test("resume reset refuses a plan without reset stages", () => {
  const original = state();
  const plan = {
    ...planFor(original),
    stages_to_reset: [],
  };

  assert.throws(
    () =>
      prepareResumeState({
        state: original,
        plan,
        planSha256: "a".repeat(64),
      }),
    /resume plan has no stages_to_reset/,
  );
});

test("apply validation requires environment opt-in and exact plan-file sha", () => {
  const root = mkdtempSync(join(tmpdir(), "hibou-resume-state-"));
  try {
    const original = state();
    const plan = planFor(original, root);
    const planPath = join(root, "resume-plan.json");
    const bytes = JSON.stringify(plan, null, 2) + "\n";
    writeFileSync(planPath, bytes);
    const sha = createHash("sha256").update(bytes).digest("hex");

    assert.throws(
      () =>
        validateResumeApply({
          root,
          plan,
          planPath,
          confirmPlanSha256: sha,
          applyEnabled: false,
        }),
      /HIBOU_VIDEO_RESUME_APPLY_ENABLED=true required/,
    );

    assert.throws(
      () =>
        validateResumeApply({
          root,
          plan,
          planPath,
          confirmPlanSha256: "b".repeat(64),
          applyEnabled: true,
        }),
      /resume plan sha256 confirmation mismatch/,
    );

    const valid = validateResumeApply({
      root,
      plan,
      planPath,
      confirmPlanSha256: sha,
      applyEnabled: true,
    });
    assert.equal(valid.root, root);
    assert.equal(valid.plan_sha256, sha);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("resume apply refuses a plan rooted at another render directory", () => {
  const root = mkdtempSync(join(tmpdir(), "hibou-resume-root-"));
  try {
    const original = state();
    const plan = planFor(original, join(root, "other"));
    const planPath = join(root, "resume-plan.json");
    writeFileSync(planPath, JSON.stringify(plan));

    assert.throws(
      () =>
        validateResumeApply({
          root,
          plan,
          planPath,
          confirmPlanSha256: "a".repeat(64),
          applyEnabled: true,
        }),
      /resume plan root does not match requested render root/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});


test("resume reset rejects unknown or non-canonical reset stages", () => {
  const original = state();

  const unknown = planFor(original);
  unknown.stages_to_reset = [...unknown.stages_to_reset, "mystery_stage"];
  assert.throws(
    () =>
      prepareResumeState({
        state: original,
        plan: unknown,
        planSha256: "a".repeat(64),
      }),
    /unknown reset stage/,
  );

  const nonCanonical = planFor(original);
  nonCanonical.stages_to_reset = nonCanonical.stages_to_reset.filter(
    (stage) => stage !== "creative_qc",
  );
  assert.throws(
    () =>
      prepareResumeState({
        state: original,
        plan: nonCanonical,
        planSha256: "a".repeat(64),
      }),
    /canonical suffix/,
  );
});

test("resume reset rejects executable publishable or no-op plans", () => {
  const original = state();

  const executable = planFor(original);
  executable.analysis_only = false;
  assert.throws(
    () =>
      prepareResumeState({
        state: original,
        plan: executable,
        planSha256: "a".repeat(64),
      }),
    /analysis_only/,
  );

  const publishable = planFor(original);
  publishable.publication_authorized = true;
  assert.throws(
    () =>
      prepareResumeState({
        state: original,
        plan: publishable,
        planSha256: "a".repeat(64),
      }),
    /cannot authorize publication/,
  );

  const noResume = planFor(original);
  noResume.resume_required = false;
  assert.throws(
    () =>
      prepareResumeState({
        state: original,
        plan: noResume,
        planSha256: "a".repeat(64),
      }),
    /must require a resume/,
  );
});

test("resume apply receipt binds plan backup source and prepared state hashes", () => {
  const receipt = buildResumeApplyReceipt({
    root: "/tmp/hibou",
    planSha256: "1".repeat(64),
    backupPath: "/tmp/hibou/pipeline-run.before.json",
    backupSha256: "2".repeat(64),
    sourceStateSha256: "3".repeat(64),
    preparedStateSha256: "4".repeat(64),
    stateFileSha256: "5".repeat(64),
    resetStages: ["voice", "render"],
    appliedAt: "2026-09-28T00:00:00.000Z",
  });

  assert.equal(receipt.schema, "HIBOU_VIDEO_RESUME_APPLY_RECEIPT_V1");
  assert.equal(receipt.plan_sha256, "1".repeat(64));
  assert.equal(receipt.backup_sha256, "2".repeat(64));
  assert.equal(receipt.source_state_sha256, "3".repeat(64));
  assert.equal(receipt.prepared_state_sha256, "4".repeat(64));
  assert.equal(receipt.state_file_sha256, "5".repeat(64));
  assert.deepEqual(receipt.reset_stages, ["voice", "render"]);
  assert.equal(receipt.artifacts_deleted, false);
  assert.equal(receipt.caches_deleted, false);
  assert.equal(receipt.execution_started, false);
  assert.equal(receipt.publication_authorized, false);
});

test("resume apply receipt rejects malformed hashes", () => {
  assert.throws(
    () =>
      buildResumeApplyReceipt({
        root: "/tmp/hibou",
        planSha256: "bad",
        backupPath: "/tmp/hibou/pipeline-run.before.json",
        backupSha256: "2".repeat(64),
        sourceStateSha256: "3".repeat(64),
        preparedStateSha256: "4".repeat(64),
        stateFileSha256: "5".repeat(64),
        resetStages: [],
      }),
    /planSha256 must be a sha256/,
  );
});
