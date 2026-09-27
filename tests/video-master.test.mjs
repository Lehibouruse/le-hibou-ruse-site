import assert from "node:assert/strict";
import test from "node:test";
import { buildFeatureActivationManifest, buildTechnicalSelections, masterPolicy, normalizeExecutionProfileOverride } from "../scripts/video-master.mjs";

test("master orchestrator is bounded and publication locked",()=>{
 const p=masterPolicy();
 assert.equal(p.max_scenes,20);
 assert.equal(p.regeneration_attempts,1);
 assert.equal(p.publication_authorized,false);
 assert.equal(p.human_master_review_required,true);
 assert.equal(p.paid_fallback,false);
});
test("master policy refuses unbounded runs",()=>{
 assert.throws(()=>masterPolicy({maxScenes:26}),/1\.\.25/);
 assert.throws(()=>masterPolicy({regenAttempts:3}),/0\.\.2/);
});
test("technical selections promote only QC PASS provisional candidates",()=>{
 const s=buildTechnicalSelections({
   S01:{status:"PROVISIONAL_QC_PASS",selected_path:"a.png"},
   S02:{status:"PROVISIONAL_QC_PASS",selected_path:"b.png"}
 });
 assert.equal(s.S01.selected,"a.png");
 assert.match(s.S01.selection_reason,/final master human review required/);
 assert.throws(()=>buildTechnicalSelections({S01:{status:"NO_PASS",selected_path:null}}),/no QC PASS image/);
});


test("job-level preview execution override is bounded and does not imply publication",()=>{
 const p=normalizeExecutionProfileOverride({mode:"preview",candidates:"1"});
 assert.deepEqual(p,{production_mode:"preview",candidates_per_scene:1});
 assert.throws(()=>normalizeExecutionProfileOverride({mode:"turbo",candidates:"1"}),/preview or final/);
 assert.throws(()=>normalizeExecutionProfileOverride({mode:"preview",candidates:"4"}),/1\.\.3/);
});

test("V5 integration gate activates every feature requested by GLOBAL profile",()=>{
 const contract={features:{
   video_timeline_v1:true,
   video_prosody_v1:true,
   video_pose_registry_v1:true,
   video_creative_qc_v1:true,
   video_music_mix_v1:false,
   video_incremental_retouch_v1:true,
   video_human_candidate_selection_v1:true
 }};
 const m=buildFeatureActivationManifest(contract,{
   integrationEnabled:true,
   envLookup:()=>false
 });
 assert.equal(m.integration_enabled,true);
 assert.deepEqual(m.blocked_requested_features,[]);
 assert.equal(m.rows.find(x=>x.feature==="video_timeline_v1").active,true);
 assert.equal(m.rows.find(x=>x.feature==="video_music_mix_v1").active,false);
});

test("requested V5 bricks cannot be silently skipped when runtime gates are absent",()=>{
 const contract={features:{video_timeline_v1:true,video_prosody_v1:true}};
 const m=buildFeatureActivationManifest(contract,{
   integrationEnabled:false,
   envLookup:()=>false
 });
 assert.deepEqual(
   m.blocked_requested_features,
   ["video_timeline_v1","video_prosody_v1"]
 );
});
