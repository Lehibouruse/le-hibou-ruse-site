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
    invalidated_stages: [
      "master_qc",
      "promotion",
      "registry",
      "render",
      "subtitles",
    ],
    invalidated_scene_ids: {
      voice: [],
      images: [],
      creative_qc: [],
      render: [],
    },
    reusable_scene_ids: {
      voice: ["S01", "S02", "S03"],
      images: ["S01", "S02", "S03"],
      render: ["S01", "S02", "S03"],
    },
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
  assert.equal(diff.review_summary.changed_scene_count, 1);
  assert.equal(diff.review_summary.unchanged_scene_count, 2);
  assert.equal(diff.review_summary.focused_scene_count, 1);
  assert.equal(
    diff.focused_scene_review[0].execution_impact.render_stage_revalidation_required,
    true,
  );
  assert.equal(
    diff.focused_scene_review[0].execution_impact.scene_rerender_forced_by_planner,
    false,
  );
  assert.equal(
    diff.focused_scene_review[0].execution_impact.render_cache_reusable,
    true,
  );
  assert.equal(
    diff.focused_scene_review[0].reason_codes.includes(
      "render_stage_revalidation_required",
    ),
    true,
  );
  assert.deepEqual(diff.execution_summary.invalidated_scene_ids.render, []);
  assert.equal(diff.execution_summary.reusable_counts.render, 3);
  assert.equal(
    diff.always_required_global_checks.includes("full_video_sanity"),
    true,
  );
  assert.equal(diff.publication_authorized, false);
});

test("image retouch on opening scene adds hero opening review", () => {
  const input = plan();
  input.changed_scene_ids = ["S01"];
  input.unchanged_scene_ids = ["S02", "S03"];
  input.scene_changes = [
    {
      scene_id: "S01",
      status: "modified",
      changed_domains: ["image"],
    },
  ];
  input.invalidated_stages = [
    "asset_resolution",
    "creative_qc",
    "images",
    "master_qc",
    "promotion",
    "registry",
    "render",
    "technical_selection",
  ];
  input.invalidated_scene_ids = {
    voice: [],
    images: ["S01"],
    creative_qc: ["S01"],
    render: ["S01"],
  };
  input.reusable_scene_ids = {
    voice: ["S01", "S02", "S03"],
    images: ["S02", "S03"],
    render: ["S02", "S03"],
  };

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
  assert.equal(
    diff.focused_scene_review[0].execution_impact.image_regeneration_forced_by_planner,
    true,
  );
  assert.equal(
    diff.focused_scene_review[0].execution_impact.creative_qc_forced_by_planner,
    true,
  );
  assert.equal(
    diff.focused_scene_review[0].execution_impact.scene_rerender_forced_by_planner,
    true,
  );
  assert.equal(
    diff.focused_scene_review[0].execution_impact.voice_cache_reusable,
    true,
  );
  assert.equal(
    diff.focused_scene_review[0].execution_impact.image_cache_reusable,
    false,
  );
  assert.equal(diff.execution_summary.forced_regeneration_counts.images, 1);
  assert.equal(diff.execution_summary.forced_regeneration_counts.render, 1);
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
  input.unchanged_scene_ids = [];
  input.invalidated_stages = [
    "prosody",
    "voice",
    "audio_master",
    "music_mix",
    "audio_attach",
    "subtitles",
    "asset_resolution",
    "images",
    "technical_selection",
    "creative_qc",
    "promotion",
    "render",
    "master_qc",
    "registry",
  ];
  input.invalidated_scene_ids = {
    voice: ["S01", "S02", "S03", "S04"],
    images: ["S01", "S02", "S03", "S04"],
    creative_qc: ["S01", "S02", "S03", "S04"],
    render: ["S01", "S02", "S03", "S04"],
  };
  input.reusable_scene_ids = {
    voice: [],
    images: [],
    render: [],
  };

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


test("removed scene is explicit and never marked cache-reusable", () => {
  const input = plan();
  input.structural_change = true;
  input.changed_scene_ids = ["S03"];
  input.unchanged_scene_ids = ["S01", "S02"];
  input.scene_changes = [
    {
      scene_id: "S01",
      status: "unchanged",
      changed_domains: [],
    },
    {
      scene_id: "S02",
      status: "unchanged",
      changed_domains: [],
    },
    {
      scene_id: "S03",
      status: "removed",
      changed_domains: ["structure"],
    },
  ];
  input.invalidated_stages = ["render", "master_qc", "registry"];
  input.invalidated_scene_ids = {
    voice: [],
    images: [],
    creative_qc: [],
    render: [],
  };
  input.reusable_scene_ids = {
    voice: ["S01", "S02"],
    images: ["S01", "S02"],
    render: ["S01", "S02"],
  };

  const diff = buildIncrementalReviewDiff(input);
  const removed = diff.focused_scene_review[0];
  assert.equal(removed.status, "removed");
  assert.equal(removed.execution_impact.scene_present_in_next_contract, false);
  assert.equal(removed.execution_impact.voice_cache_reusable, false);
  assert.equal(removed.execution_impact.image_cache_reusable, false);
  assert.equal(removed.execution_impact.render_cache_reusable, false);
  assert.equal(
    removed.reason_codes.includes("scene_removed_from_next_contract"),
    true,
  );
  assert.equal(diff.review_summary.removed_scene_count, 1);
  assert.equal(diff.full_review_required, true);
});
