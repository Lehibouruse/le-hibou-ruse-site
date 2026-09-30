import assert from "node:assert/strict";
import test from "node:test";
import { buildNegativePolicyCoverage } from "../scripts/video-negative-policy-coverage.mjs";
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
    unchanged_scene_ids: ["S01", "S03"],
    invalidated_stages: ["subtitles", "render"],
  };
  input.reviewDiff = {
    schema: "HIBOU_INCREMENTAL_REVIEW_DIFF_V1",
    review_scope: "FOCUSED_PLUS_GLOBAL_SANITY",
    full_review_required: false,
    review_summary: {
      changed_scene_count: 1,
      unchanged_scene_count: 2,
      focused_scene_count: 1,
    },
    execution_summary: {
      invalidated_stages: ["subtitles", "render"],
      forced_regeneration_counts: {
        voice: 0,
        images: 0,
        creative_qc: 0,
        render: 0,
      },
      reusable_counts: {
        voice: 3,
        images: 3,
        render: 3,
      },
    },
    focused_scene_review: [
      {
        scene_id: "S02",
        status: "modified",
        changed_domains: ["captions"],
        reason_codes: [
          "scene_status_modified",
          "changed_domain_captions",
          "render_stage_revalidation_required",
        ],
        focused_human_checks: ["captions_mobile_readable"],
        execution_impact: {
          render_stage_revalidation_required: true,
          scene_rerender_forced_by_planner: false,
          render_cache_reusable: true,
        },
      },
    ],
    global_focused_checks: [],
    always_required_global_checks: ["full_video_sanity"],
    unchanged_scenes_may_reference_previous_review: true,
  };

  const review = buildHumanReviewPackage(input);

  assert.equal(
    review.incremental_context.review_scope,
    "FOCUSED_PLUS_GLOBAL_SANITY",
  );
  assert.equal(review.incremental_context.full_review_required, false);
  assert.equal(review.incremental_context.review_diff_available, true);
  assert.equal(
    review.incremental_context.previous_human_approval_auto_reused,
    false,
  );
  assert.equal(review.incremental_context.unchanged_scenes_auto_approved, false);
  assert.equal(
    review.incremental_context.unchanged_scenes_may_reference_previous_review,
    true,
  );
  assert.deepEqual(
    review.incremental_context.always_required_global_checks,
    ["full_video_sanity"],
  );
  assert.equal(review.incremental_context.scene_review_queue.length, 1);
  assert.deepEqual(
    review.incremental_context.scene_review_queue[0].reason_codes,
    [
      "scene_status_modified",
      "changed_domain_captions",
      "render_stage_revalidation_required",
    ],
  );
  assert.equal(
    review.incremental_context.scene_review_queue[0].execution_impact
      .render_cache_reusable,
    true,
  );
  assert.equal(
    review.incremental_context.scene_review_queue[0].human_decision,
    "PENDING",
  );
  assert.equal(
    review.incremental_context.review_summary.changed_scene_count,
    1,
  );
  assert.equal(
    review.incremental_context.execution_summary.reusable_counts.render,
    3,
  );
});


test("missing incremental review diff falls back to full review with warning", () => {
  const input = base();
  input.incrementalPlan = {
    schema: "HIBOU_INCREMENTAL_RETOUCH_PLAN_V1",
    changed_scene_ids: ["S02"],
    unchanged_scene_ids: ["S01"],
    invalidated_stages: ["render"],
  };
  input.reviewDiff = null;

  const review = buildHumanReviewPackage(input);

  assert.equal(review.incremental_context.review_diff_available, false);
  assert.equal(review.incremental_context.review_scope, "FULL");
  assert.equal(review.incremental_context.full_review_required, true);
  assert.deepEqual(review.incremental_context.scene_review_queue, []);
  assert.equal(
    review.machine_warnings.some(
      (item) => item.code === "incremental_review_diff_not_available",
    ),
    true,
  );
  assert.equal(review.human_approved, false);
  assert.equal(review.publication_authorized, false);
});

test("invalid incremental review diff schema never narrows review scope", () => {
  const input = base();
  input.incrementalPlan = {
    schema: "HIBOU_INCREMENTAL_RETOUCH_PLAN_V1",
    changed_scene_ids: ["S02"],
    invalidated_stages: ["render"],
  };
  input.reviewDiff = {
    schema: "OTHER",
    review_scope: "FOCUSED_PLUS_GLOBAL_SANITY",
    full_review_required: false,
    focused_scene_review: [{ scene_id: "S02" }],
  };

  const review = buildHumanReviewPackage(input);

  assert.equal(review.incremental_context.review_diff_available, false);
  assert.equal(review.incremental_context.review_scope, "FULL");
  assert.equal(review.incremental_context.full_review_required, true);
  assert.equal(
    review.machine_warnings.some(
      (item) => item.code === "incremental_review_diff_invalid_schema",
    ),
    true,
  );
  assert.equal(review.previous_human_approval_auto_reused, undefined);
  assert.equal(review.human_approved, false);
});

test("Airtable negative policy requires the current source and explicit pending review for each category", () => {
  const input=base();
  const negativePrompt="no humans, no camera shake, no critical baked-in text";
  const coverage=buildNegativePolicyCoverage(negativePrompt);
  input.storyboard={content:{source:"airtable"},creative:{negative_prompt:negativePrompt}};
  const missing=buildHumanReviewPackage(input);
  assert.equal(missing.eligible_for_final_approval,false);
  input.imagePlan={creative_contract_enforced:true,negative_policy_coverage:coverage};
  const review=buildHumanReviewPackage(input);
  assert.equal(review.eligible_for_final_approval,true);
  assert.equal(review.negative_policy_clause_count,3);
  assert.equal(review.negative_policy_review_check_ids.length,3);
  for(const group of coverage.groups){
    const item=review.checklist.find(item=>item.id===group.human_review_check_id);
    assert.deepEqual(item.source_exclusions,group.clauses);
    assert.equal(item.negative_policy_source_sha256,coverage.source_sha256);
    assert.equal(item.status,"PENDING_HUMAN");
    assert.equal(item.human_pass,null);
  }
  input.storyboard.creative.negative_prompt+=", no duplicated branding";
  const stale=buildHumanReviewPackage(input);
  assert.equal(stale.eligible_for_final_approval,false);
  assert.equal(stale.negative_policy_clause_count,0);
  assert.equal(stale.checklist.some(item=>item.id.startsWith("negative_")),false);
});
