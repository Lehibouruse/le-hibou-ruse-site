import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCandidateReview as buildCandidateReviewSource,
  CANDIDATE_REVIEW_SCHEMA,
  buildCandidateDecisionTemplate,
  renderCandidateReviewHtml,
} from "../scripts/video-candidate-review.mjs";

const CONTRACT_REF={schema:"HIBOU_PROMPT_CONTRACT_REF_V2",contract_sha256:"a".repeat(64),global_sha256:"b".repeat(64),scene_count:2};
function sceneRef(sceneId,index){return {...CONTRACT_REF,specific_sha256:String(index).repeat(64),combined_sha256:String(index+2).repeat(64),scene_id:sceneId};}
function strictCandidateInput(input){
  const out=structuredClone(input);
  if(out?.plan?.schema==="HIBOU_IMAGE_PLAN_V1"){
    out.plan.prompt_contract_ref=structuredClone(CONTRACT_REF);
    for(const request of out.plan.requests||[]){
      const index=request.scene_id==="S01"?1:2;
      request.request={...(request.request||{}),prompt_contract_ref:sceneRef(request.scene_id,index)};
    }
  }
  return out;
}
function buildCandidateReview(input,options){return buildCandidateReviewSource(strictCandidateInput(input),options);}

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
        request:{
          overrides:{"6":{text:"SCENE_IMAGE_PROMPT: two financing routes converge toward one asset"}},
          prompt_application:{
            schema:"HIBOU_IMAGE_PROMPT_APPLICATION_V2",
            prompt_node_id:"6",
            prompt_input:"text",
            compiled_prompt_sha256:"c".repeat(64),
            specific_sha256:"1".repeat(64)
          }
        }
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
  assert.match(review.review_fingerprint_sha256, /^[0-9a-f]{64}$/);
  assert.equal(review.publication_authorized, false);
  assert.equal(review.human_review_required, true);

  const scene = review.scenes.find((x) => x.scene_id === "S01");
  assert.equal(scene.technical_provisional_candidate_id, "S01-C1");
  assert.equal(scene.machine_recommended_candidate_id, "S01-C2");
  assert.equal(scene.machine_recommendation_status, "RECOMMENDED");
  assert.equal(scene.machine_recommendation_score_gap, 15);
  assert.equal(scene.human_selected_candidate_id, null);
  assert.equal(scene.human_decision, "PENDING");
  assert.equal(scene.ranking_is_advisory, true);
  assert.equal(scene.candidates.every((x) => x.human_approved === false), true);
  const bound=scene.candidates.find((x)=>x.candidate_id==="S01-C1");
  assert.match(bound.effective_prompt,/two financing routes converge/);
  assert.equal(bound.compiled_prompt_sha256,"c".repeat(64));
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
  assert.match(html, /Brief effectif envoyé à ComfyUI/);
  assert.match(html, /two financing routes converge/);
  assert.doesNotMatch(html, /publication_authorized=true/);
});

test("contact sheet rejects incompatible review schema", () => {
  assert.throws(
    () => renderCandidateReviewHtml({ schema: "OTHER" }),
    /HIBOU_CANDIDATE_REVIEW_V1 required for HTML/,
  );
});


test("decision template is bound to exact candidate review fingerprint", () => {
  const review = buildCandidateReview(fixtures());
  const template = buildCandidateDecisionTemplate(review);

  assert.equal(template.schema, "HIBOU_HUMAN_IMAGE_SELECTION_V1");
  assert.equal(
    template.review_fingerprint_sha256,
    review.review_fingerprint_sha256,
  );
  assert.deepEqual(Object.keys(template.decisions).sort(), ["S01"]);
  assert.equal(template.decisions.S01.candidate_id, null);
  assert.equal(template.decisions.S01.human_confirmed, false);
  assert.equal(template.publication_authorized, false);
});

test("candidate review fingerprint changes when candidate identity changes", () => {
  const one = buildCandidateReview(fixtures());
  const changed = fixtures();
  changed.perceptualQc.rows[0].candidate_id = "S01-C9";
  changed.plan.requests[0].candidate_id = "S01-C9";
  changed.provisionalSelections.S01.selected_candidate_id = "S01-C9";
  const two = buildCandidateReview(changed);

  assert.notEqual(
    one.review_fingerprint_sha256,
    two.review_fingerprint_sha256,
  );
});


test("equal top scores are explicitly ambiguous instead of preferring C1", () => {
  const input = fixtures();
  input.perceptualQc.rows[0].perceptual_score = 100;
  input.perceptualQc.rows[1].perceptual_score = 100;
  const review = buildCandidateReview(input);
  const scene = review.scenes.find((x) => x.scene_id === "S01");

  assert.equal(scene.technical_provisional_candidate_id, "S01-C1");
  assert.equal(scene.machine_recommended_candidate_id, null);
  assert.equal(scene.machine_recommendation_status, "AMBIGUOUS");
  assert.equal(scene.machine_recommendation_score_gap, 0);
  assert.equal(
    scene.machine_recommendation_reason,
    "top_candidates_within_score_gap",
  );
});

test("near-tied candidates inside configured margin remain ambiguous", () => {
  const input = fixtures();
  input.perceptualQc.rows[0].perceptual_score = 98.5;
  input.perceptualQc.rows[1].perceptual_score = 100;
  const review = buildCandidateReview(input,);
  const scene = review.scenes.find((x) => x.scene_id === "S01");

  assert.equal(scene.machine_recommended_candidate_id, null);
  assert.equal(scene.machine_recommendation_status, "AMBIGUOUS");
  assert.equal(scene.machine_recommendation_score_gap, 1.5);
});

test("candidate review fingerprint becomes stale when the effective compiled prompt changes",()=>{
  const first=buildCandidateReview(fixtures());
  const changed=fixtures();
  changed.plan.requests[0].request.overrides["6"].text="SCENE_IMAGE_PROMPT: a different financial mechanism";
  changed.plan.requests[0].request.prompt_application.compiled_prompt_sha256="d".repeat(64);
  const second=buildCandidateReview(changed);
  assert.notEqual(first.review_fingerprint_sha256,second.review_fingerprint_sha256);
});
