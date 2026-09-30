import assert from "node:assert/strict";
import test from "node:test";
import { factoryPolicy, summarizeGenerationRuns } from "../scripts/video-image-factory.mjs";

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
