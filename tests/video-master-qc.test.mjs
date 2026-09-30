import assert from "node:assert/strict";
import test from "node:test";
import { creativeMasterReview } from "../scripts/video-master-qc.mjs";

function goodScene(id,order,{hibou=false}={}){
  return {
    scene_id:id,order,
    framing:{hibou},
    composition:{
      camera_transform:{zoom_percent:3.2,anchor:"center",source:"global_fallback_micro_motion_v2"},
      ...(hibou?{character_pose:{path:"owl.webp"}}:{})
    }
  };
}

test("creative master review passes when voice identity and motion coverage are explicit",()=>{
  const contract={
    audio:{voice_profile_runtime:{identity_lock_enabled:true,bootstrap_reference_sha256:"abc"}},
    scenes:[goodScene("S1",1,{hibou:true}),goodScene("S2",2),goodScene("S3",3,{hibou:true})]
  };
  const review=creativeMasterReview({contract,visualEventRate:{thirds:[{subtle_event_count:0,planned_attention_beat_count:0},{subtle_event_count:0,planned_attention_beat_count:0},{subtle_event_count:0,planned_attention_beat_count:0}]}});
  assert.equal(review.status,"PASS");
  assert.equal(review.metrics.voice_identity_locked,true);
  assert.equal(review.metrics.voice_reference_ready,true);
  assert.equal(review.metrics.motion_coverage_ratio,1);
  assert.equal(review.metrics.missing_hibou_layer_count,0);
});

test("creative master review flags a V1-like master with unlocked voice and sparse motion contract",()=>{
  const scenes=Array.from({length:13},(_,i)=>({
    scene_id:`S${i+1}`,order:i+1,framing:{hibou:i===0},composition:{...(i===0?{character_pose:{path:"owl.webp"}}:{})},
    ...(i<2?{timeline:{events:[{type:"camera",start_s:0,end_s:1,zoom_percent:3}]}}:{})
  }));
  const contract={audio:{voice_profile_runtime:{}},scenes};
  const review=creativeMasterReview({contract,visualEventRate:{thirds:[
    {subtle_event_count:1,planned_attention_beat_count:4},
    {subtle_event_count:0,planned_attention_beat_count:0},
    {subtle_event_count:0,planned_attention_beat_count:0}
  ]}});
  assert.equal(review.status,"REVIEW");
  assert(review.reasons.some(x=>x.code==="voice_identity_lock_missing"));
  assert(review.reasons.some(x=>x.code==="motion_contract_coverage_low"));
  assert(review.reasons.some(x=>x.code==="subtle_motion_proxy_sparse"));
  assert.equal(review.metrics.motion_scene_count,2);
});

test("creative master review requires a usable reference when identity lock is enabled",()=>{
  const contract={audio:{voice_profile_runtime:{identity_lock_enabled:true,audio_reference_present:false}},scenes:[goodScene("S1",1)]};
  const review=creativeMasterReview({contract});
  assert.equal(review.status,"REVIEW");
  assert(review.reasons.some(x=>x.code==="voice_identity_reference_missing"));
});
