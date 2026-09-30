import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { readFileSync } from "node:fs";
import { buildTargetedRegeneration } from "../scripts/video-image-regenerate.mjs";

const qc = readFileSync(
  new URL("../scripts/video-image-perceptual-qc.py", import.meta.url),
  "utf8",
);

test("perceptual QC treats low sharpness and near-duplicate pHash as warnings", () => {
  assert.match(qc, /warnings\.append\("low_sharpness"\)/);
  assert.match(qc, /warnings\.append\("near_duplicate_phash"\)/);
  assert.match(qc, /status="PASS" if technical_ok and not reasons else "REJECT"/);
  assert.match(qc, /"low_sharpness_is_warning":True/);
  assert.match(qc, /"phash_duplicate_is_warning":True/);
});

test("perceptual duplicate comparison is scoped within a scene", () => {
  assert.match(qc, /seen_by_scene=\{\}/);
  assert.match(qc, /scene_seen=seen_by_scene\.setdefault\(row\.get\("scene_id"\),\[\]\)/);
  assert.match(qc, /"phash_duplicate_scope":"within_scene"/);
});

test("scene QC summary records reject reasons and warning counts", () => {
  assert.match(qc, /reason_counts=\{\}/);
  assert.match(qc, /warning_counts=\{\}/);
  assert.match(qc, /"selected_score"/);
});

test("targeted regeneration mutates actual ComfyUI seed and prompt overrides", () => {
  const contractRef={schema:"HIBOU_PROMPT_CONTRACT_REF_V2",contract_sha256:"a".repeat(64),global_sha256:"b".repeat(64),scene_count:1};
  const sceneRef={...contractRef,specific_sha256:"c".repeat(64),combined_sha256:"d".repeat(64),scene_id:"scene-1"};
  const plan = {
    schema: "HIBOU_IMAGE_PLAN_V1",
    content_id: "content",
    prompt_contract_ref: contractRef,
    requests: [{
      candidate_id: "scene-1-C1",
      scene_id: "scene-1",
      candidate: 1,
      seed: 123,
      request: {
        prompt_contract_ref: sceneRef,
        prompt_application: {
          schema:"HIBOU_IMAGE_PROMPT_APPLICATION_V2",
          prompt_node_id:"6",
          prompt_input:"text",
          compiled_prompt_sha256:createHash("sha256").update("original visual prompt").digest("hex"),
          image_prompt_component_included:true,
          visual_idea_component_included:true,
          preservation:{status:"PASS"}
        },
        seed_application:{schema:"HIBOU_IMAGE_SEED_APPLICATION_V1",seed_node_id:"25",seed_input:"noise_seed",seed:123},
        overrides: {
          "6": { text: "original visual prompt" },
          "25": { noise_seed: 123 },
          "5": { width: 768, height: 1344, batch_size: 1 }
        }
      },
      fallback_request: {
        prompt_contract_ref: sceneRef,
        prompt_application: {
          schema:"HIBOU_IMAGE_PROMPT_APPLICATION_V2",
          prompt_node_id:"6",
          prompt_input:"text",
          compiled_prompt_sha256:createHash("sha256").update("original visual prompt").digest("hex"),
          image_prompt_component_included:true,
          visual_idea_component_included:true,
          preservation:{status:"PASS"}
        },
        seed_application:{schema:"HIBOU_IMAGE_SEED_APPLICATION_V1",seed_node_id:"25",seed_input:"noise_seed",seed:123},
        overrides: {
          "6": { text: "original visual prompt" },
          "25": { noise_seed: 123 },
          "5": { width: 640, height: 1136, batch_size: 1 }
        }
      }
    }]
  };
  const perceptual = {
    schema: "HIBOU_IMAGE_PERCEPTUAL_QC_V1",
    scene_summary: { "scene-1": { needs_regeneration: true } }
  };

  const out = buildTargetedRegeneration(plan, perceptual, { attempt: 1 });
  assert.equal(out.requests.length, 1);
  const item = out.requests[0];
  assert.equal(item.seed, 100126);
  assert.equal(item.request.overrides["25"].noise_seed, 100126);
  assert.equal(item.fallback_request.overrides["25"].noise_seed, 100126);
  assert.equal(item.request.overrides["5"].width, 768);
  assert.equal(item.request.overrides["5"].height, 1344);
  assert.match(item.request.overrides["6"].text, /Variation locale 1/);
  assert.match(item.fallback_request.overrides["6"].text, /Variation locale 1/);
});
