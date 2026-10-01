import assert from "node:assert/strict";
import test from "node:test";
import { buildVoiceDensityPlan, VOICE_DENSITY_PLAN_SCHEMA } from "../scripts/video-voice-density-plan.mjs";

function fixture(){
  return {
    contract_version:"HIBOU_VIDEO_CONTRACT_V1",
    content:{content_id:"recCONTENT1234567"},
    audio:{density_profile:"RELENTLESS"},
    scenes:[
      {
        scene_id:"S01",order:1,
        voice:{
          target_wpm:195,
          relative_speed_pct:102,
          pause_after_ms:100,
          prosody_cues:[
            {phrase:"Chaque année.",pause_before_ms:120,pause_after_ms:80}
          ]
        }
      },
      {
        scene_id:"S02",order:2,
        voice:{
          target_wpm:190,
          relative_speed_pct:100,
          pause_after_ms:300,
          prosody_cues:[]
        }
      }
    ]
  };
}

test("RELENTLESS flags planned pauses over the observed 250 ms boundary without rewriting them",()=>{
  const plan=buildVoiceDensityPlan(fixture());
  assert.equal(plan.schema,VOICE_DENSITY_PLAN_SCHEMA);
  assert.equal(plan.density_profile,"RELENTLESS");
  assert.equal(plan.review_required,true);
  assert(plan.warnings.some(w=>w.code==="relentless_planned_pause_over_250ms" && w.scene_id==="S02"));
  assert.equal(plan.scenes[1].max_planned_pause_ms,300);
  assert.equal(plan.policy.prosody_mutation,false);
});

test("RELENTLESS accepts a dense plan when all deliberate pauses stay at or below 250 ms",()=>{
  const input=fixture();
  input.scenes[1].voice.pause_after_ms=200;
  const plan=buildVoiceDensityPlan(input);
  assert.equal(plan.review_required,false);
  assert.equal(plan.profile_policy.deliberate_pause_soft_limit_ms,250);
});

test("EXPLAINER_DENSE stays advisory until audio E2E calibration defines a numeric threshold",()=>{
  const input=fixture();
  input.audio.density_profile="EXPLAINER_DENSE";
  const plan=buildVoiceDensityPlan(input);
  assert.equal(plan.review_required,false);
  assert.equal(plan.profile_policy.deliberate_pause_soft_limit_ms,null);
  assert.equal(plan.profile_policy.numeric_pause_threshold_requires_audio_e2e_calibration,true);
  assert.equal(plan.policy.explainer_dense_threshold_not_invented,true);
});

test("missing profile is reported but no hidden default is invented",()=>{
  const input=fixture();
  input.audio.density_profile=null;
  const plan=buildVoiceDensityPlan(input);
  assert.equal(plan.density_profile,null);
  assert(plan.warnings.some(w=>w.code==="voice_density_profile_missing"));
  assert.equal(plan.review_required,false);
});

test("unsupported profile fails closed",()=>{
  const input=fixture();
  input.audio.density_profile="MAXIMUM_SPEED";
  assert.throws(()=>buildVoiceDensityPlan(input),/VOICE_DENSITY_PROFILE must be one of/);
});

test("planner is deterministic and cannot execute TTS or mutate narration",()=>{
  const a=buildVoiceDensityPlan(fixture());
  const b=buildVoiceDensityPlan(fixture());
  assert.equal(a.voice_density_plan_sha256,b.voice_density_plan_sha256);
  assert.equal(a.policy.narration_mutation,false);
  assert.equal(a.policy.tts_execution_performed,false);
  assert.equal(a.policy.audio_execution_performed,false);
  assert.equal(a.policy.publication_authorized,false);
});
