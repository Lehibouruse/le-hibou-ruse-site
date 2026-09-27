import assert from "node:assert/strict";
import test from "node:test";
import {
  buildIncrementalReviewDiff,
  REVIEW_DIFF_SCHEMA,
} from "../scripts/video-review-diff.mjs";

function plan() {
  return {
    schema: "HIBOU_INCREMENTAL_RETOUCH_PLAN_V1",
    content_id: "recVideo",
    previous_contract_sha256: "a".repeat(64),
    next_contract_sha256: "b".repeat(64),
    structural_change: false,
    global_changes: [],
    changed_scene_ids: ["S02"],
    unchanged_scene_ids: ["S01", "S03"],
    scene_changes: [
      {
        scene_id: "S01",
        status: "unchanged",
        changed_domains: [],
      },
      {
        scene_id: "S02",
        status: "modified",
        changed_domains: ["captions"],
      },
      {
        scene_id: "S03",
        status: "unchanged",
        changed_domains: [],
      },
    ],
  };
}

test("caption-only retouch creates focused review plus global sanity checks", () => {
  const diff = buildIncrementalReviewDiff(plan());

  assert.equal(diff.schema, REVIEW_DIFF_SCHEMA);
  assert.equal(diff.review_scope, "FOCUSED_PLUS_GLOBAL_SANITY");
  assert.equal(diff.full_review_required, false);
  assert.equal(diff.focused_scene_review.length, 1);
  assert.deepEqual(
    diff.focused_scene_review[0].focused_human_checks.sort(),
    ["branding_unique", "captions_mobile_readable"].sort(),
  );
  assert.equal(diff.unchanged_scenes_auto_approved, false);
  assert.equal(diff.previous_human_approval_auto_reused, false);
  assert.equal(
    diff.always_required_global_checks.includes("full_video_sanity"),
    true,
  );
  assert.equal(diff.publication_authorized, false);
});

test("image retouch on opening scene adds hero opening review", () => {
  const input = plan();
  input.changed_scene_ids = ["S01"];
  input.scene_changes = [
    {
      scene_id: "S01",
      status: "modified",
      changed_domains: ["image"],
    },
  ];

  const diff = buildIncrementalReviewDiff(input);
  assert.equal(
    diff.focused_scene_review[0].focused_human_checks.includes("hero_opening"),
    true,
  );
  assert.equal(
    diff.focused_scene_review[0].focused_human_checks.includes(
      "hibou_stable_premium",
    ),
    true,
  );
});

test("style or feature global changes force a full human review", () => {
  for (const change of ["style", "features"]) {
    const input = plan();
    input.global_changes = [change];
    const diff = buildIncrementalReviewDiff(input);

    assert.equal(diff.full_review_required, true);
    assert.equal(diff.review_scope, "FULL");
    assert.equal(diff.unchanged_scenes_may_reference_previous_review, false);
  }
});

test("structural change forces a full review", () => {
  const input = plan();
  input.structural_change = true;
  input.changed_scene_ids = ["S02", "S04"];
  input.scene_changes.push({
    scene_id: "S04",
    status: "added",
    changed_domains: ["timing", "voice", "image", "composition", "captions"],
  });

  const diff = buildIncrementalReviewDiff(input);
  assert.equal(diff.full_review_required, true);
  assert.equal(diff.review_scope, "FULL");
  assert.equal(
    diff.focused_scene_review.some((x) =>
      x.focused_human_checks.includes("voice_natural"),
    ),
    true,
  );
});

test("no changed scene never auto-reuses approval and requests full sanity", () => {
  const input = plan();
  input.changed_scene_ids = [];
  input.scene_changes = input.scene_changes.map((x) => ({
    ...x,
    status: "unchanged",
    changed_domains: [],
  }));

  const diff = buildIncrementalReviewDiff(input);
  assert.equal(diff.full_review_required, true);
  assert.equal(diff.previous_human_approval_auto_reused, false);
  assert.equal(diff.human_review_required, true);
});

test("review diff rejects incompatible input schema", () => {
  assert.throws(
    () => buildIncrementalReviewDiff({ schema: "OTHER" }),
    /HIBOU_INCREMENTAL_RETOUCH_PLAN_V1 required/,
  );
});
