import assert from "node:assert/strict";
import test from "node:test";
import {
  applyHumanCandidateSelection,
  HUMAN_IMAGE_SELECTION_SCHEMA,
} from "../scripts/video-candidate-selection-apply.mjs";

function review() {
  return {
    schema: "HIBOU_CANDIDATE_REVIEW_V1",
    content_id: "recCONTENT1234567",
    scenes: [
      {
        scene_id: "S01",
        reviewable: true,
        machine_recommended_candidate_id: "S01-C1",
        candidates: [
          {
            candidate_id: "S01-C1",
            status: "PASS",
            path: "/tmp/s01-c1.png",
          },
          {
            candidate_id: "S01-C2",
            status: "PASS",
            path: "/tmp/s01-c2.png",
          },
        ],
      },
      {
        scene_id: "S02",
        reviewable: false,
        machine_recommended_candidate_id: null,
        candidates: [
          {
            candidate_id: "S02-C1",
            status: "REJECT",
            path: "/tmp/s02-c1.png",
          },
        ],
      },
    ],
  };
}

test("explicit human choice may differ from machine recommendation", () => {
  const result = applyHumanCandidateSelection({
    review: review(),
    decisions: {
      schema: HUMAN_IMAGE_SELECTION_SCHEMA,
      content_id: "recCONTENT1234567",
      decisions: {
        S01: {
          candidate_id: "S01-C2",
          human_confirmed: true,
          note: "Meilleure composition.",
        },
      },
    },
  });

  assert.equal(result.selection_count, 1);
  assert.equal(result.selections.S01.selected_candidate_id, "S01-C2");
  assert.equal(result.selections.S01.human_selected, true);
  assert.equal(result.selections.S01.publication_authorized, false);
  assert.equal(result.audit[0].followed_machine_recommendation, false);
});

test("selection rejects a candidate that failed QC", () => {
  const input = review();
  input.scenes[0].candidates[1].status = "REJECT";

  assert.throws(
    () =>
      applyHumanCandidateSelection({
        review: input,
        decisions: {
          schema: HUMAN_IMAGE_SELECTION_SCHEMA,
          content_id: "recCONTENT1234567",
          decisions: {
            S01: {
              candidate_id: "S01-C2",
              human_confirmed: true,
            },
          },
        },
      }),
    /must have PASS status/,
  );
});

test("selection requires explicit human confirmation", () => {
  assert.throws(
    () =>
      applyHumanCandidateSelection({
        review: review(),
        decisions: {
          schema: HUMAN_IMAGE_SELECTION_SCHEMA,
          content_id: "recCONTENT1234567",
          decisions: {
            S01: {
              candidate_id: "S01-C1",
              human_confirmed: false,
            },
          },
        },
      }),
    /human_confirmed=true required/,
  );
});

test("selection requires all reviewable scenes and ignores non-reviewable ones", () => {
  assert.throws(
    () =>
      applyHumanCandidateSelection({
        review: review(),
        decisions: {
          schema: HUMAN_IMAGE_SELECTION_SCHEMA,
          content_id: "recCONTENT1234567",
          decisions: {},
        },
      }),
    /human selection missing for reviewable scenes: S01/,
  );
});

test("selection rejects unknown scenes and content mismatch", () => {
  assert.throws(
    () =>
      applyHumanCandidateSelection({
        review: review(),
        decisions: {
          schema: HUMAN_IMAGE_SELECTION_SCHEMA,
          content_id: "recOTHER12345678",
          decisions: {
            S01: {
              candidate_id: "S01-C1",
              human_confirmed: true,
            },
          },
        },
      }),
    /content_id mismatch/,
  );

  assert.throws(
    () =>
      applyHumanCandidateSelection({
        review: review(),
        decisions: {
          schema: HUMAN_IMAGE_SELECTION_SCHEMA,
          content_id: "recCONTENT1234567",
          decisions: {
            S01: {
              candidate_id: "S01-C1",
              human_confirmed: true,
            },
            S99: {
              candidate_id: "S99-C1",
              human_confirmed: true,
            },
          },
        },
      }),
    /unknown scenes: S99/,
  );
});
