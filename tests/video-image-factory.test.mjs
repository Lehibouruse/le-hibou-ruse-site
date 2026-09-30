import assert from "node:assert/strict";
import test from "node:test";
import { applyCandidateCreativeQc, factoryPolicy, summarizeGenerationRuns } from "../scripts/video-image-factory.mjs";

test("image factory defaults to one scene and one targeted regeneration",()=>{
 const p=factoryPolicy();
 assert.deepEqual(p,{max_scenes:1,max_regeneration_attempts:1,paid_fallback:false,human_review_required:true});
});
test("image factory caps scope and regeneration attempts",()=>{
 assert.throws(()=>factoryPolicy({maxScenes:21}),/1\.\.20/);
 assert.throws(()=>factoryPolicy({maxRegenerationAttempts:3}),/0\.\.2/);
 assert.equal(factoryPolicy({maxScenes:5,maxRegenerationAttempts:2}).max_scenes,5);
});


test("generation throughput estimates 1 2 and 3 candidates per scene",()=>{
 const summary=summarizeGenerationRuns([
  {
   generated_candidate_count:2,
   cache_hits:1,
   timing:{generated_candidate_elapsed_ms:120000,elapsed_ms:121000}
  },
  {
   generated_candidate_count:1,
   cache_hits:0,
   timing:{generated_candidate_elapsed_ms:60000,elapsed_ms:61000}
  }
 ],{sceneCount:13});
 assert.equal(summary.schema,"HIBOU_IMAGE_GENERATION_THROUGHPUT_V1");
 assert.equal(summary.generated_candidate_count,3);
 assert.equal(summary.cache_hits,1);
 assert.equal(summary.mean_generated_candidate_elapsed_ms,60000);
 assert.deepEqual(summary.estimated_generation_seconds,{
   one_candidate_per_scene:780,
   two_candidates_per_scene:1560,
   three_candidates_per_scene:2340
 });
 assert.equal(summary.publication_authorized,false);
});

test("throughput estimates stay null when every candidate is served from cache",()=>{
 const summary=summarizeGenerationRuns([
  {generated_candidate_count:0,cache_hits:13,timing:{generated_candidate_elapsed_ms:0,elapsed_ms:25}}
 ],{sceneCount:13});
 assert.equal(summary.generated_candidate_count,0);
 assert.equal(summary.mean_generated_candidate_elapsed_ms,null);
 assert.equal(summary.estimated_generation_seconds.one_candidate_per_scene,null);
 assert.equal(summary.cache_hits,13);
});

test("candidate semantic QC rejects a prettier but off-brief image before provisional selection",()=>{
 const perceptual={
  schema:"HIBOU_IMAGE_PERCEPTUAL_QC_V1",
  rows:[
   {scene_id:"S01",candidate_id:"S01-C1",candidate:1,status:"PASS",perceptual_score:96,reasons:[],warnings:[]},
   {scene_id:"S01",candidate_id:"S01-C2",candidate:2,status:"PASS",perceptual_score:82,reasons:[],warnings:[]}
  ],
  scene_summary:{S01:{pass:2,reject:0,total:2,selected_candidate_id:"S01-C1",needs_regeneration:false}},
  all_scenes_have_candidate:true
 };
 const creative={
  schema:"HIBOU_CREATIVE_QC_V1",
  scenes:[
   {scene_id:"S01",candidate_id:"S01-C1",pass:false,scores:{semantic_brief:0.42},reasons:["semantic mismatch"]},
   {scene_id:"S01",candidate_id:"S01-C2",pass:true,scores:{semantic_brief:0.71},reasons:[]}
  ]
 };
 const out=applyCandidateCreativeQc(perceptual,creative);
 assert.equal(out.rows[0].status,"REJECT");
 assert(out.rows[0].reasons.includes("creative_semantic_reject"));
 assert.equal(out.rows[1].status,"PASS");
 assert.equal(out.scene_summary.S01.selected_candidate_id,"S01-C2");
 assert.equal(out.scene_summary.S01.selected_creative_semantic_score,0.71);
 assert.equal(out.all_scenes_have_candidate,true);
});

test("candidate semantic QC requests regeneration when every technical candidate misses the brief",()=>{
 const perceptual={
  schema:"HIBOU_IMAGE_PERCEPTUAL_QC_V1",
  rows:[{scene_id:"S01",candidate_id:"S01-C1",candidate:1,status:"PASS",perceptual_score:90,reasons:[],warnings:[]}],
  scene_summary:{S01:{pass:1,reject:0,total:1,selected_candidate_id:"S01-C1",needs_regeneration:false}},
  all_scenes_have_candidate:true
 };
 const creative={schema:"HIBOU_CREATIVE_QC_V1",scenes:[
  {scene_id:"S01",candidate_id:"S01-C1",pass:false,scores:{semantic_brief:0.40},reasons:["semantic mismatch"]}
 ]};
 const out=applyCandidateCreativeQc(perceptual,creative);
 assert.equal(out.scene_summary.S01.needs_regeneration,true);
 assert.equal(out.all_scenes_have_candidate,false);
 assert.equal(out.candidate_creative_qc.rejected_candidate_count,1);
});
