import assert from "node:assert/strict";
import test from "node:test";
import { buildMotionPlan, MOTION_PLAN_SCHEMA } from "../scripts/video-motion-plan.mjs";

function fixture(){
  return {
    contract_version:"HIBOU_VIDEO_CONTRACT_V1",
    content:{content_id:"recCONTENT1234567"},
    creative:{
      movement_profile:"HYBRID_BEATS",
      curve_profile:"HOOK_FAST_BODY_ADAPTIVE_CTA_OPTIONAL_BOOST",
    },
    scenes:[
      {
        scene_id:"S01",order:1,voice:{intent:"hook"},
        timeline:{events:[{type:"text",start_s:0,end_s:1,text:"HOOK"}]},
      },
      {
        scene_id:"S02",order:2,voice:{intent:"explain"},
        timeline:{events:[
          {type:"object",start_s:0,end_s:2,path:"coin.png",offset_x:0,move_to_offset_x:30}
        ]},
      },
      {
        scene_id:"S03",order:3,voice:{intent:"cta"},
        timeline:{events:[
          {type:"camera",beat_kind:"MICRO_ZOOM",start_s:0,end_s:2,zoom_percent:3}
        ]},
      },
    ],
  };
}

test("motion planner separates GLOBAL profile from per-scene execution mode",()=>{
  const plan=buildMotionPlan(fixture());
  assert.equal(plan.schema,MOTION_PLAN_SCHEMA);
  assert.equal(plan.movement_profile,"HYBRID_BEATS");
  assert.equal(plan.scenes[0].recommended_motion_mode,"STATIC_SCENE");
  assert.equal(plan.scenes[1].recommended_motion_mode,"ANIMATED_SCENE");
  assert.equal(plan.scenes[2].recommended_motion_mode,"ANIMATED_SCENE");
  assert.equal(plan.scenes[2].recommendation_source,"explicit_camera_motion_signal");
  assert.deepEqual(plan.scene_mode_counts,{STATIC_SCENE:1,ANIMATED_SCENE:2});
});

test("curve zones are driven by explicit voice intent and stay planning metadata",()=>{
  const plan=buildMotionPlan(fixture());
  assert.deepEqual(plan.scenes.map(x=>x.curve_zone),[
    "HOOK_FAST",
    "BODY_ADAPTIVE",
    "CTA_OPTIONAL_BOOST",
  ]);
  assert.equal(plan.policy.automatic_timeline_mutation,false);
  assert.equal(plan.policy.contract_mutation_performed,false);
});

test("intra-scene motion profile accepts explicit camera motion without inventing extra motion",()=>{
  const input=fixture();
  input.creative.movement_profile="INTRA_SCENE_MOTION";
  input.scenes[1].timeline={events:[{type:"camera",start_s:0,end_s:2,zoom_percent:3}]};
  const plan=buildMotionPlan(input);
  assert.equal(plan.scenes[1].recommended_motion_mode,"ANIMATED_SCENE");
  assert.equal(plan.scenes[1].recommendation_source,"explicit_camera_motion_signal");
  assert.equal(plan.warnings.some(w=>w.code==="intra_scene_motion_profile_without_explicit_motion"&&w.scene_id==="S02"),false);
});

test("explicit STATIC_SCENE with layer motion warns but is never silently rewritten",()=>{
  const input=fixture();
  input.scenes[1].motion_mode="STATIC_SCENE";
  const plan=buildMotionPlan(input);
  assert.equal(plan.scenes[1].recommended_motion_mode,"STATIC_SCENE");
  assert.equal(plan.scenes[1].recommendation_source,"explicit_scene_contract");
  assert(plan.warnings.some(w=>w.code==="static_scene_contains_motion"));
  assert.equal(plan.policy.automatic_scene_mode_mutation,false);
});

test("micro-zoom is treated as real camera motion",()=>{
  const plan=buildMotionPlan(fixture());
  const s3=plan.scenes.find(x=>x.scene_id==="S03");
  assert.equal(s3.signals.camera_motion_count,1);
  assert.equal(s3.signals.layer_motion_count,0);
  assert.equal(s3.recommended_motion_mode,"ANIMATED_SCENE");
  assert.equal(s3.recommendation_source,"explicit_camera_motion_signal");
  assert.equal(plan.policy.camera_motion_reclassifies_scene,true);
  assert.equal(plan.policy.micro_zoom_does_not_by_itself_reclassify_static_scene,false);
});

test("unsupported movement profiles fail closed",()=>{
  const input=fixture();
  input.creative.movement_profile="RANDOM_MOTION";
  assert.throws(()=>buildMotionPlan(input),/MOVEMENT_PROFILE must be one of/);
});

test("planner is deterministic and cannot execute GPU, model calls or publication",()=>{
  const a=buildMotionPlan(fixture());
  const b=buildMotionPlan(fixture());
  assert.equal(a.motion_plan_sha256,b.motion_plan_sha256);
  assert.equal(a.policy.model_calls_performed,false);
  assert.equal(a.policy.gpu_execution_performed,false);
  assert.equal(a.policy.publication_authorized,false);
});
