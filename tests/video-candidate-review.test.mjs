import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCandidateReview,
  CANDIDATE_REVIEW_SCHEMA,
  renderCandidateReviewHtml,
} from "../scripts/video-candidate-review.mjs";

function fixtures() {
  const plan = {
    schema: "HIBOU_IMAGE_PLAN_V1",
    content_id: "recCONTENT1234567",
    requests: [
      {
        candidate_id: "S01-C1",
        scene_id: "S01",
        candidate: 1,
        seed: 101,
      },
      {
        candidate_id: "S01-C2",
        scene_id: "S01",
        candidate: 2,
        seed: 102,
      },
      {
        candidate_id: "S02-C1",
        scene_id: "S02",
        candidate: 1,
        seed: 201,
      },
    ],
  };

  const perceptualQc = {
    schema: "HIBOU_IMAGE_PERCEPTUAL_QC_V1",
    content_id: "recCONTENT1234567",
    rows: [
      {
        scene_id: "S01",
        candidate_id: "S01-C1",
        candidate: 1,
        path: "/tmp/s01-c1.png",
        perceptual_score: 80,
        status: "PASS",
        reasons: [],
        warnings: ["low_sharpness"],
      },
      {
        scene_id: "S01",
        candidate_id: "S01-C2",
        candidate: 2,
        path: "/tmp/s01-c2.png",
        perceptual_score: 95,
        status: "PASS",
        reasons: [],
        warnings: [],
      },
      {
        scene_id: "S02",
        candidate_id: "S02-C1",
        candidate: 1,
        path: "/tmp/s02-c1.png",
        perceptual_score: 30,
        status: "REJECT",
        reasons: ["too_dark"],
        warnings: [],
      },
    ],
  };

  const provisionalSelections = {
    S01: {
      selected_candidate_id: "S01-C1",
      selected_path: "/tmp/s01-c1.png",
      status: "PROVISIONAL_QC_PASS",
      human_review_required: true,
    },
    S02: {
      selected_candidate_id: null,
      selected_path: null,
      status: "NO_PASS",
      human_review_required: true,
    },
  };

  return { plan, perceptualQc, provisionalSelections };
}

test("candidate review keeps machine recommendation separate from human choice", () => {
  const review = buildCandidateReview(fixtures());

  assert.equal(review.schema, CANDIDATE_REVIEW_SCHEMA);
  assert.equal(review.publication_authorized, false);
  assert.equal(review.human_review_required, true);

  const scene = review.scenes.find((x) => x.scene_id === "S01");
  assert.equal(scene.machine_recommended_candidate_id, "S01-C1");
  assert.equal(scene.human_selected_candidate_id, null);
  assert.equal(scene.human_decision, "PENDING");
  assert.equal(scene.ranking_is_advisory, true);
  assert.equal(scene.candidates.every((x) => x.human_approved === false), true);
});

test("candidate review preserves all candidates and sorts PASS before REJECT", () => {
  const review = buildCandidateReview(fixtures());
  const scene = review.scenes.find((x) => x.scene_id === "S01");

  assert.equal(scene.candidate_count, 2);
  assert.deepEqual(
    scene.candidates.map((x) => x.candidate_id),
    ["S01-C2", "S01-C1"],
  );
  assert.equal(scene.candidates[0].perceptual_score, 95);
  assert.deepEqual(scene.candidates[1].warnings, ["low_sharpness"]);
});

test("scene with no PASS candidate is a review blocker, not auto-selected", () => {
  const review = buildCandidateReview(fixtures());
  const scene = review.scenes.find((x) => x.scene_id === "S02");

  assert.equal(scene.reviewable, false);
  assert.equal(scene.machine_recommended_candidate_id, null);
  assert.equal(scene.human_selected_candidate_id, null);
  assert.equal(review.blocking_scene_count, 1);
  assert.equal(review.all_scenes_reviewable, false);
});

test("machine fallback ranking is advisory when provisional choice is absent", () => {
  const { plan, perceptualQc } = fixtures();
  const review = buildCandidateReview({
    plan,
    perceptualQc,
    provisionalSelections: {},
  });
  const scene = review.scenes.find((x) => x.scene_id === "S01");

  assert.equal(scene.machine_recommended_candidate_id, "S01-C2");
  assert.equal(scene.human_selected_candidate_id, null);
});

test("candidate review rejects incompatible input schemas", () => {
  assert.throws(
    () =>
      buildCandidateReview({
        plan: { schema: "OTHER" },
        perceptualQc: { schema: "HIBOU_IMAGE_PERCEPTUAL_QC_V1" },
      }),
    /HIBOU_IMAGE_PLAN_V1 required/,
  );

  assert.throws(
    () =>
      buildCandidateReview({
        plan: { schema: "HIBOU_IMAGE_PLAN_V1", requests: [] },
        perceptualQc: { schema: "OTHER" },
      }),
    /HIBOU_IMAGE_PERCEPTUAL_QC_V1 required/,
  );
});


test("contact sheet keeps recommendation machine visibly advisory", () => {
  const review = buildCandidateReview(fixtures());
  const html = renderCandidateReviewHtml(review);

  assert.match(html, /Revue des candidats images/);
  assert.match(html, /recommandation machine/);
  assert.match(html, /Aucun candidat n’est approuvé automatiquement/);
  assert.match(html, /Décision humaine : <strong>EN ATTENTE<\/strong>/);
  assert.match(html, /S01-C1/);
  assert.match(html, /S01-C2/);
  assert.doesNotMatch(html, /publication_authorized=true/);
});

test("contact sheet rejects incompatible review schema", () => {
  assert.throws(
    () => renderCandidateReviewHtml({ schema: "OTHER" }),
    /HIBOU_CANDIDATE_REVIEW_V1 required for HTML/,
  );
});
