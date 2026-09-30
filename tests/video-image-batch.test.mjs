import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { executeImagePlan, executionReceiptVerified, imageRequestFingerprint, isCudaOom, promptApplicationVerified } from "../scripts/video-image-batch.mjs";

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

test("same candidate id is regenerated when its effective request changes",async()=>{
 const root=mkdtempSync(resolve(tmpdir(),"hibou-img-cache-key-"));
 const manifest=resolve(root,"manifest.json"), selections=resolve(root,"selections.json");
 let calls=0;
 const runner=async req=>{
   calls+=1; const p=resolve(root,`candidate-${req.a}.png`); writeFileSync(p,`img-${req.a}`);
   return {job_id:`job-${req.a}`,request_sha256:`h-${req.a}`,attempts:1,outputs:[{path:p}]};
 };
 const one={...plan,requests:[plan.requests[0]]};
 const first=await executeImagePlan(one,{runner,manifestPath:manifest,selectionTemplatePath:selections});
 assert.equal(first.generated_this_run,1);
 const changed=structuredClone(one);
 changed.requests[0].request={a:99,prompt:"new visual brief"};
 const second=await executeImagePlan(changed,{runner,manifestPath:manifest,selectionTemplatePath:selections});
 assert.equal(calls,2);
 assert.equal(second.cache_hits,0);
 assert.equal(second.cache_invalidations,1);
 assert.equal(second.generated_this_run,1);
 const stored=JSON.parse(readFileSync(manifest,"utf8")).results["S01-C1"];
 assert.equal(stored.request_fingerprint,imageRequestFingerprint(changed.requests[0]));
 assert.match(stored.outputs[0].path,/candidate-99\.png$/);
});

test("request fingerprint covers the local OOM fallback as well as the primary request",()=>{
 const a={request:{profile:"primary"},fallback_request:{profile:"low"}};
 const b={request:{profile:"primary"},fallback_request:{profile:"lower"}};
 assert.notEqual(imageRequestFingerprint(a),imageRequestFingerprint(b));
});

test("request fingerprint ignores audit-only prompt contract metadata",()=>{
 const a={request:{profile:"primary",prompt_contract_ref:{schema:"HIBOU_PROMPT_CONTRACT_REF_V2",contract_sha256:"a".repeat(64)}}};
 const b={request:{profile:"primary",prompt_contract_ref:{schema:"HIBOU_PROMPT_CONTRACT_REF_V2",contract_sha256:"b".repeat(64)}}};
 assert.equal(imageRequestFingerprint(a),imageRequestFingerprint(b));
 const c={request:{profile:"primary",prompt:"different"}};
 assert.notEqual(imageRequestFingerprint(a),imageRequestFingerprint(c));
});

test("strict prompt contract never reuses a legacy cache entry without execution receipt",async()=>{
 const root=mkdtempSync(resolve(tmpdir(),"hibou-img-receipt-"));
 const manifest=resolve(root,"manifest.json"), selections=resolve(root,"selections.json");
 let calls=0;
 const runner=async req=>{
   calls+=1; const path=resolve(root,"candidate.png"); writeFileSync(path,"img");
   return {job_id:"job",request_sha256:"hash",attempts:1,outputs:[{path}]};
 };
 const legacy={schema:"HIBOU_IMAGE_PLAN_V1",content_id:"recREF",requests:[
   {candidate_id:"S01-C1",scene_id:"S01",candidate:1,seed:1,request:{profile:"primary"}}
 ]};
 await executeImagePlan(legacy,{runner,manifestPath:manifest,selectionTemplatePath:selections});
 assert.equal(calls,1);
 const strict=structuredClone(legacy);
 strict.requests[0].request.prompt_contract_ref={
   schema:"HIBOU_PROMPT_CONTRACT_REF_V2",
   contract_sha256:"a".repeat(64),
   global_sha256:"b".repeat(64),
   specific_sha256:"c".repeat(64),
   combined_sha256:"d".repeat(64),
   scene_id:"S01"
 };
 const second=await executeImagePlan(strict,{runner,manifestPath:manifest,selectionTemplatePath:selections});
 assert.equal(calls,2);
 assert.equal(second.cache_hits,0);
 assert.equal(second.generated_this_run,1);
 const stored=JSON.parse(readFileSync(manifest,"utf8")).results["S01-C1"];
 assert.equal(stored.prompt_contract_execution_verified,false);
 assert.deepEqual(stored.prompt_contract_ref,strict.requests[0].request.prompt_contract_ref);
});

test("compiled prompt application proof is bound to the exact ComfyUI override text",()=>{
 const prompt="SCENE_IMAGE_PROMPT: rich mechanics\nSCENE_VISUAL_INTENT: four blocks converge";
 const v1={
   overrides:{"6":{text:prompt}},
   prompt_application:{
     schema:"HIBOU_IMAGE_PROMPT_APPLICATION_V1",
     prompt_node_id:"6",
     prompt_input:"text",
     compiled_prompt_sha256:createHash("sha256").update(prompt).digest("hex"),
     image_prompt_component_included:true,
     visual_idea_component_included:true
   }
 };
 assert.equal(promptApplicationVerified(v1),true);
 const v2=structuredClone(v1);
 v2.prompt_application={
   ...v2.prompt_application,
   schema:"HIBOU_IMAGE_PROMPT_APPLICATION_V2",
   compiled_image_prompt_sha256:"a".repeat(64),
   compiled_visual_idea_sha256:"b".repeat(64),
   preservation:{status:"PASS",image_prompt_retention_ratio:0.8}
 };
 assert.equal(promptApplicationVerified(v2),true);
 const review=structuredClone(v2);
 review.prompt_application.preservation.status="REVIEW";
 assert.equal(promptApplicationVerified(review),false);
 const drifted=structuredClone(v2);
 drifted.overrides["6"].text+=" altered";
 assert.equal(promptApplicationVerified(drifted),false);
});


test("strict execution proof requires a matching last-mile Comfy receipt",()=>{
 const prompt="SCENE_IMAGE_PROMPT: two routes";
 const sha=createHash("sha256").update(prompt).digest("hex");
 const request={
  overrides:{"6":{text:prompt}},
  prompt_application:{
   schema:"HIBOU_IMAGE_PROMPT_APPLICATION_V2",
   prompt_node_id:"6",prompt_input:"text",compiled_prompt_sha256:sha,
   image_prompt_component_included:true,visual_idea_component_included:true,
   preservation:{status:"PASS"}
  }
 };
 const result={execution_receipt:{
  schema:"HIBOU_COMFY_PROMPT_EXECUTION_V1",
  prompt_verified:true,
  compiled_prompt_sha256:sha,
  applied_prompt_sha256:sha,
  workflow_sha256:"f".repeat(64)
 }};
 assert.equal(executionReceiptVerified(request,result),true);
 const drifted=structuredClone(result);
 drifted.execution_receipt.applied_prompt_sha256="0".repeat(64);
 assert.equal(executionReceiptVerified(request,drifted),false);
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
 assert.equal(stored.request_fingerprint,imageRequestFingerprint(one.requests[0]));
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


test("preview-sized plans prune stale extra candidate cache entries without deleting files",async()=>{
 const root=mkdtempSync(resolve(tmpdir(),"hibou-img-prune-"));
 const manifest=resolve(root,"manifest.json"), selections=resolve(root,"selections.json");
 let calls=0;
 const runner=async req=>{
   calls+=1; const p=resolve(root,`candidate-${req.a}.png`); writeFileSync(p,`img-${req.a}`);
   return {job_id:`job-${req.a}`,request_sha256:`h-${req.a}`,attempts:1,outputs:[{path:p}]};
 };
 const full={...plan,requests:plan.requests.slice(0,3)};
 await executeImagePlan(full,{runner,manifestPath:manifest,selectionTemplatePath:selections});
 assert.equal(calls,3);
 const preview={...plan,requests:[plan.requests[0]]};
 const second=await executeImagePlan(preview,{runner,manifestPath:manifest,selectionTemplatePath:selections});
 assert.equal(second.cache_hits,1);
 assert.equal(second.cache_pruned_entries,2);
 assert.equal(Object.keys(JSON.parse(readFileSync(manifest,"utf8")).results).length,1);
 assert.equal(readFileSync(resolve(root,"candidate-2.png"),"utf8"),"img-2");
});


test("image batch timing telemetry is deterministic and persisted",async()=>{
 const root=mkdtempSync(resolve(tmpdir(),"hibou-img-timing-"));
 const manifest=resolve(root,"manifest.json"), selections=resolve(root,"selections.json");
 const one={schema:"HIBOU_IMAGE_PLAN_V1",content_id:"recTIME",requests:[
  {candidate_id:"S01-C1",scene_id:"S01",candidate:1,seed:1,request:{profile:"primary"}}
 ]};
 let clock=1000;
 const now=()=>clock;
 const runner=async()=>{
   clock+=750;
   const p=resolve(root,"timed.png"); writeFileSync(p,"timed");
   return {job_id:"timed-job",request_sha256:"timed-hash",attempts:1,outputs:[{path:p}]};
 };
 const result=await executeImagePlan(one,{
   runner,
   manifestPath:manifest,
   selectionTemplatePath:selections,
   now
 });
 assert.equal(result.timing.generated_candidate_count,1);
 assert.equal(result.timing.generated_candidate_elapsed_ms,750);
 assert.equal(result.timing.mean_generated_candidate_elapsed_ms,750);
 assert.equal(result.timing.elapsed_ms,750);
 const stored=JSON.parse(readFileSync(manifest,"utf8"));
 assert.equal(stored.results["S01-C1"].elapsed_ms,750);
 assert.equal(stored.results["S01-C1"].primary_elapsed_ms,750);
 assert.equal(stored.results["S01-C1"].fallback_elapsed_ms,null);
 assert.equal(stored.run_timing.elapsed_ms,750);
});
