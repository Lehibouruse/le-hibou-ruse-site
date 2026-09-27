import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHumanReviewPackage,
  HUMAN_REVIEW_SCHEMA,
} from "../scripts/video-human-review-package.mjs";

function base() {
  return {
    masterResult: {
      schema: "HIBOU_VIDEO_MASTER_RESULT_V1",
      production_mode: "final",
      preview_only: false,
      publication_authorized: false,
      features: {
        video_prosody_v1: true,
        video_creative_qc_v1: true,
      },
    },
    masterQc: {
      schema: "HIBOU_MASTER_QC_V2",
      status: "PASS",
    },
    creativeQc: {
      schema: "HIBOU_CREATIVE_QC_V1",
      status: "PASS",
    },
    candidateReview: {
      schema: "HIBOU_CANDIDATE_REVIEW_V1",
      blocking_scene_count: 0,
      human_review_required: true,
      publication_authorized: false,
    },
    artifactRegistry: {
      schema: "HIBOU_VIDEO_ARTIFACT_REGISTRY_V2",
      production_mode: "final",
      preview_only: false,
      publication_authorized: false,
    },
    incrementalPlan: null,
  };
}

test("human review package never converts machine PASS into human approval", () => {
  const review = buildHumanReviewPackage(base());

  assert.equal(review.schema, HUMAN_REVIEW_SCHEMA);
  assert.equal(review.eligible_for_final_approval, true);
  assert.equal(review.decision, "PENDING_HUMAN_REVIEW");
  assert.equal(review.human_approved, false);
  assert.equal(review.publication_authorized, false);
  assert.equal(
    review.checklist.every(
      (item) => item.status === "PENDING_HUMAN" && item.human_pass === null,
    ),
    true,
  );
});

test("preview can be reviewed but can never be eligible for final approval", () => {
  const input = base();
  input.masterResult.production_mode = "preview";
  input.masterResult.preview_only = true;
  input.artifactRegistry.production_mode = "preview";
  input.artifactRegistry.preview_only = true;

  const review = buildHumanReviewPackage(input);

  assert.equal(review.preview_only, true);
  assert.equal(review.eligible_for_human_review, true);
  assert.equal(review.eligible_for_final_approval, false);
  assert.equal(review.publication_authorized, false);
});

test("machine blockers prevent final approval eligibility", () => {
  const input = base();
  input.masterQc.status = "BROKEN";
  input.creativeQc.status = "REJECT";
  input.candidateReview.blocking_scene_count = 2;

  const review = buildHumanReviewPackage(input);
  const codes = review.machine_blockers.map((x) => x.code);

  assert.equal(review.eligible_for_final_approval, false);
  assert.equal(codes.includes("master_qc_invalid_status"), true);
  assert.equal(codes.includes("creative_qc_reject"), true);
  assert.equal(codes.includes("candidate_review_has_blocking_scenes"), true);
});

test("missing enabled creative QC is a blocker", () => {
  const input = base();
  input.creativeQc = null;

  const review = buildHumanReviewPackage(input);

  assert.equal(
    review.machine_blockers.some(
      (x) => x.code === "creative_qc_missing_while_enabled",
    ),
    true,
  );
  assert.equal(review.eligible_for_final_approval, false);
});

test("incremental review focuses human attention on changed scenes", () => {
  const input = base();
  input.incrementalPlan = {
    schema: "HIBOU_INCREMENTAL_RETOUCH_PLAN_V1",
    changed_scene_ids: ["S02", "S05"],
    invalidated_stages: ["render", "master_qc"],
  };

  const review = buildHumanReviewPackage(input);

  assert.deepEqual(review.incremental_context.changed_scene_ids, ["S02", "S05"]);
  assert.equal(
    review.incremental_context.human_should_focus_changed_scenes,
    true,
  );
});

test("publication authorization signals are blockers and still output false", () => {
  const input = base();
  input.masterResult.publication_authorized = true;
  input.artifactRegistry.publication_authorized = true;

  const review = buildHumanReviewPackage(input);
  const codes = review.machine_blockers.map((x) => x.code);

  assert.equal(codes.includes("master_result_publication_must_be_false"), true);
  assert.equal(codes.includes("artifact_registry_publication_must_be_false"), true);
  assert.equal(review.publication_authorized, false);
  assert.equal(review.human_approved, false);
});


test("incremental review scope is exposed without auto-reusing human approval", () => {
  const input = base();
  input.incrementalPlan = {
    schema: "HIBOU_INCREMENTAL_RETOUCH_PLAN_V1",
    changed_scene_ids: ["S02"],
    invalidated_stages: ["subtitles", "render"],
  };
  input.reviewDiff = {
    schema: "HIBOU_INCREMENTAL_REVIEW_DIFF_V1",
    review_scope: "FOCUSED_PLUS_GLOBAL_SANITY",
    full_review_required: false,
    focused_scene_review: [
      {
        scene_id: "S02",
        focused_human_checks: ["captions_mobile_readable"],
      },
    ],
    global_focused_checks: [],
    always_required_global_checks: ["full_video_sanity"],
  };

  const review = buildHumanReviewPackage(input);

  assert.equal(
    review.incremental_context.review_scope,
    "FOCUSED_PLUS_GLOBAL_SANITY",
  );
  assert.equal(review.incremental_context.full_review_required, false);
  assert.equal(
    review.incremental_context.previous_human_approval_auto_reused,
    false,
  );
  assert.deepEqual(
    review.incremental_context.always_required_global_checks,
    ["full_video_sanity"],
  );
});
