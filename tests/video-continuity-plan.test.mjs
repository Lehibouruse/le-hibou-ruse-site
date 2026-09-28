import assert from "node:assert/strict";
import test from "node:test";
import { buildContinuityPlan, CONTINUITY_SCHEMA } from "../scripts/video-continuity-plan.mjs";

function contract(){
  return {
    contract_version:"HIBOU_VIDEO_CONTRACT_V1",
    content:{content_id:"recCONTENT1234567"},
    creative:{profile_name:"HIBOU_VIRAL_V1"},
    scenes:[
      {
        scene_id:"S01",order:1,visual_group:"office-a",
        image_prompt:"Same financial office, base composition.",
        visual_idea:"Office de départ",pose_request:"neutral",screen_text:"HOOK",
        asset_requirements:[
          {slot:"background",kind:"background",required_tags:["office","ink"]},
          {slot:"character_pose",kind:"character",required_tags:["neutral"]}
        ]
      },
      {
        scene_id:"S02",order:2,visual_group:"office-a",
        image_prompt:"Same office, add cash prop.",
        visual_idea:"Même office + cash",pose_request:"explique",screen_text:"CASH",
        asset_requirements:[]
      },
      {
        scene_id:"S03",order:3,visual_group:"office-a",
        image_prompt:"Same office, add calendar.",
        visual_idea:"Même office + calendrier",pose_request:"pointe",screen_text:"1 AN",
        asset_requirements:[]
      },
      {
        scene_id:"S04",order:4,
        image_prompt:"New chart environment.",
        visual_idea:"Graphique",pose_request:"graphique",screen_text:"112 K€",
        asset_requirements:[]
      }
    ]
  };
}

test("continuity groups generate one base then reuse it for explicit members",()=>{
  const plan=buildContinuityPlan(contract());
  assert.equal(plan.schema,CONTINUITY_SCHEMA);
  assert.equal(plan.visual_group_count,1);
  assert.equal(plan.grouped_scene_count,3);
  assert.equal(plan.independent_scene_count,1);
  assert.equal(plan.planned_background_generations,1);
  assert.equal(plan.planned_background_reuses,2);
  assert.equal(plan.scenes[0].mode,"BASE_GENERATION");
  assert.equal(plan.scenes[1].mode,"REUSE_GROUP_BASE");
  assert.equal(plan.scenes[2].mode,"REUSE_GROUP_BASE");
  assert.equal(plan.scenes[3].mode,"INDEPENDENT");
});

test("continuity planner never infers groups from prompt wording",()=>{
  const input=contract();
  input.scenes[1].visual_group=null;
  input.scenes[1].image_prompt="Same exact office as previous scene.";
  const plan=buildContinuityPlan(input);
  const s2=plan.scenes.find(scene=>scene.scene_id==="S02");
  assert.equal(s2.mode,"INDEPENDENT");
  assert.equal(plan.policy.no_prompt_text_heuristics,true);
});

test("continuity fingerprints are deterministic and change when the base changes",()=>{
  const a=buildContinuityPlan(contract());
  const b=buildContinuityPlan(contract());
  assert.equal(a.continuity_plan_sha256,b.continuity_plan_sha256);
  const changed=contract();
  changed.scenes[0].image_prompt+=" Add a brass lamp.";
  const c=buildContinuityPlan(changed);
  assert.notEqual(a.continuity_plan_sha256,c.continuity_plan_sha256);
  assert.notEqual(a.groups[0].group_fingerprint_sha256,c.groups[0].group_fingerprint_sha256);
});

test("non-contiguous and single-scene groups warn without silently changing intent",()=>{
  const input=contract();
  input.scenes[2].visual_group="other";
  const plan=buildContinuityPlan(input);
  assert.equal(plan.warnings.some(w=>w.code==="single_scene_visual_group"),true);

  const input2=contract();
  input2.scenes[1].visual_group=null;
  const plan2=buildContinuityPlan(input2);
  assert.equal(plan2.warnings.some(w=>w.code==="visual_group_non_contiguous"),true);
});

test("invalid asset requirements fail closed",()=>{
  const input=contract();
  input.scenes[0].asset_requirements=[{slot:"background"}];
  assert.throws(()=>buildContinuityPlan(input),/needs slot and kind/);
});

test("planner is planning-only and cannot authorize publication",()=>{
  const plan=buildContinuityPlan(contract());
  assert.equal(plan.policy.execution_performed,false);
  assert.equal(plan.policy.gpu_execution_performed,false);
  assert.equal(plan.policy.contract_mutation_performed,false);
  assert.equal(plan.policy.publication_authorized,false);
});
