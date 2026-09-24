import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { executeImagePlan, isCudaOom } from "../scripts/video-image-batch.mjs";

const plan={schema:"HIBOU_IMAGE_PLAN_V1",content_id:"recX",requests:[
 {candidate_id:"S01-C1",scene_id:"S01",candidate:1,seed:1,request:{a:1}},
 {candidate_id:"S01-C2",scene_id:"S01",candidate:2,seed:2,request:{a:2}},
 {candidate_id:"S01-C3",scene_id:"S01",candidate:3,seed:3,request:{a:3}},
 {candidate_id:"S02-C1",scene_id:"S02",candidate:1,seed:4,request:{a:4}},
 {candidate_id:"S02-C2",scene_id:"S02",candidate:2,seed:5,request:{a:5}},
 {candidate_id:"S02-C3",scene_id:"S02",candidate:3,seed:6,request:{a:6}}
]};
test("image batch writes partial progress and reuses completed candidates",async()=>{
 const root=mkdtempSync(resolve(tmpdir(),"hibou-img-batch-"));
 const manifest=resolve(root,"manifest.json"), selections=resolve(root,"selections.json");
 let calls=0;
 const runner=async req=>{
   calls+=1; const p=resolve(root,`candidate-${req.a}.png`); writeFileSync(p,`img-${req.a}`);
   return {job_id:`job-${req.a}`,request_sha256:`h-${req.a}`,attempts:1,outputs:[{path:p}]};
 };
 const first=await executeImagePlan(plan,{runner,manifestPath:manifest,selectionTemplatePath:selections,maxScenes:1});
 assert.equal(calls,3); assert.equal(first.generated_this_run,3);
 assert.equal(first.selections.S01.candidates.length,3); assert.equal(first.selections.S01.selected,null);
 const second=await executeImagePlan(plan,{runner,manifestPath:manifest,selectionTemplatePath:selections,maxScenes:1});
 assert.equal(calls,3); assert.equal(second.cache_hits,3); assert.equal(second.generated_this_run,0);
 assert.equal(JSON.parse(readFileSync(manifest,"utf8")).paid_fallback,false);
});

test("CUDA OOM retries exactly once with the prepared local fallback request",async()=>{
 const root=mkdtempSync(resolve(tmpdir(),"hibou-img-oom-"));
 const manifest=resolve(root,"manifest.json"), selections=resolve(root,"selections.json");
 const one={schema:"HIBOU_IMAGE_PLAN_V1",content_id:"recOOM",requests:[
  {candidate_id:"S01-C1",scene_id:"S01",candidate:1,seed:1,request:{profile:"primary"},fallback_request:{profile:"fallback"}}
 ]};
 let calls=0;
 const runner=async req=>{
   calls+=1;
   if(req.profile==="primary") throw new Error("CUDA out of memory. Tried to allocate 512 MiB");
   const p=resolve(root,"fallback.png"); writeFileSync(p,"fallback");
   return {job_id:"fallback-job",request_sha256:"fallback-hash",attempts:1,outputs:[{path:p}]};
 };
 const result=await executeImagePlan(one,{runner,manifestPath:manifest,selectionTemplatePath:selections});
 assert.equal(calls,2);
 assert.equal(result.generated_this_run,1);
 const stored=JSON.parse(readFileSync(manifest,"utf8")).results["S01-C1"];
 assert.equal(stored.status,"completed");
 assert.equal(stored.fallback_used,true);
 assert.match(stored.primary_error,/out of memory/i);
 assert.equal(stored.request_sha256,"fallback-hash");
 assert.equal(result.manifest.paid_fallback,false);
});

test("non-OOM image failures never trigger the fallback request",async()=>{
 const one={schema:"HIBOU_IMAGE_PLAN_V1",content_id:"recFAIL",requests:[
  {candidate_id:"S01-C1",scene_id:"S01",candidate:1,seed:1,request:{profile:"primary"},fallback_request:{profile:"fallback"}}
 ]};
 let calls=0;
 await assert.rejects(
   executeImagePlan(one,{runner:async()=>{calls+=1;throw new Error("workflow node missing");}}),
   /workflow node missing/
 );
 assert.equal(calls,1);
 assert.equal(isCudaOom(new Error("workflow node missing")),false);
 assert.equal(isCudaOom(new Error("torch.OutOfMemoryError: CUDA out of memory")),true);
});
