import assert from "node:assert/strict";
import test from "node:test";
import { buildPlanningManifest, PLANNING_MANIFEST_SCHEMA } from "../scripts/video-planning-manifest.mjs";

function fixture(){
  const storyboard={
    contract_version:"HIBOU_VIDEO_CONTRACT_V1",
    runtime_commit:"a".repeat(40),
    content:{content_id:"rec1"},
    scenes:[
      {scene_id:"S01",image_prompt:"office with coin",visual_idea:"office",narration_exact:{text:"A"}},
      {scene_id:"S02",image_prompt:"office with chart",visual_idea:"chart",narration_exact:{text:"B"}},
    ],
  };
  const prompt_graph={
    schema:"HIBOU_VIDEO_PROMPT_GRAPH_V1",
    prompt_graph_sha256:"1".repeat(64),
    nodes:[
      {id:"SCENE_PROMPT[S01]",kind:"SCENE_PROMPT",SCENE_DELTA:{scene_id:"S01",image_prompt:"office with coin",visual_idea:"office"},ATTENTION_BEATS:[]},
      {id:"SCENE_PROMPT[S02]",kind:"SCENE_PROMPT",SCENE_DELTA:{scene_id:"S02",image_prompt:"office with chart",visual_idea:"chart"},ATTENTION_BEATS:[{beat_id:"S02-B01"}]},
    ],
  };
  return {
    storyboard,
    prompt_graph,
    motion_plan:{schema:"HIBOU_VIDEO_MOTION_PLAN_V1",motion_plan_sha256:"2".repeat(64)},
    voice_density_plan:{schema:"HIBOU_VIDEO_VOICE_DENSITY_PLAN_V1",voice_density_plan_sha256:"3".repeat(64)},
    continuity_plan:{schema:"HIBOU_VISUAL_CONTINUITY_PLAN_V1",continuity_plan_sha256:"4".repeat(64)},
    asset_readiness:null,
    runtime_commit:"a".repeat(40),
  };
}

test("planning manifest binds all advisory planners and every scene prompt",()=>{
  const manifest=buildPlanningManifest(fixture());
  assert.equal(manifest.schema,PLANNING_MANIFEST_SCHEMA);
  assert.equal(manifest.scene_count,2);
  assert.equal(manifest.scene_prompt_receipts[0].prompt_graph_node_id,"SCENE_PROMPT[S01]");
  assert.equal(manifest.scene_prompt_receipts[1].source_matches_graph,true);
  assert.equal(manifest.artifacts.prompt_graph.declared_sha256,"1".repeat(64));
  assert.equal(manifest.asset_readiness_included,false);
});

test("asset readiness is optional but schema-checked when present",()=>{
  const input=fixture();
  input.asset_readiness={schema:"HIBOU_ASSET_GRAPH_READINESS_V1",ready_for_activation:false};
  const manifest=buildPlanningManifest(input);
  assert.equal(manifest.asset_readiness_included,true);
  assert.equal(manifest.artifacts.asset_readiness.schema,"HIBOU_ASSET_GRAPH_READINESS_V1");
});

test("scene prompt drift fails closed",()=>{
  const input=fixture();
  input.storyboard.scenes[0].image_prompt="different visual";
  assert.throws(()=>buildPlanningManifest(input),/Prompt Graph scene source drift: S01/);
});

test("missing required planner fails closed",()=>{
  const input=fixture();
  input.motion_plan=null;
  assert.throws(()=>buildPlanningManifest(input),/motion_plan is required/);
});

test("manifest is deterministic and cannot authorize execution or publication",()=>{
  const a=buildPlanningManifest(fixture());
  const b=buildPlanningManifest(fixture());
  assert.equal(a.planning_manifest_sha256,b.planning_manifest_sha256);
  assert.equal(a.policy.gpu_execution_performed,false);
  assert.equal(a.policy.model_calls_performed,false);
  assert.equal(a.policy.storyboard_mutation_performed,false);
  assert.equal(a.policy.publication_authorized,false);
});
