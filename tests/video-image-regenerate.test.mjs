import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { buildTargetedRegeneration } from "../scripts/video-image-regenerate.mjs";

const contractRef={schema:"HIBOU_PROMPT_CONTRACT_REF_V2",contract_sha256:"a".repeat(64),global_sha256:"b".repeat(64),scene_count:2};
function request(sceneId,seed,prompt,index){
 const ref={...contractRef,specific_sha256:String(index).repeat(64),combined_sha256:String(index+2).repeat(64),scene_id:sceneId};
 return {
  overrides:{"6":{text:prompt},"25":{noise_seed:seed,model_name:"flux1-schnell-fp8.safetensors"}},
  prompt_application:{
   schema:"HIBOU_IMAGE_PROMPT_APPLICATION_V2",
   prompt_node_id:"6",prompt_input:"text",
   compiled_prompt_sha256:createHash("sha256").update(prompt).digest("hex"),
   specific_sha256:ref.specific_sha256,
   image_prompt_component_included:true,visual_idea_component_included:true,
   preservation:{status:"PASS",raw_image_prompt_chars:20,compiled_image_prompt_chars:20,image_prompt_retention_ratio:1,
    raw_visual_idea_chars:20,compiled_visual_idea_chars:20,visual_idea_retention_ratio:1}
  },
  seed_application:{schema:"HIBOU_IMAGE_SEED_APPLICATION_V1",seed_node_id:"25",seed_input:"noise_seed",seed},
  prompt_contract_ref:ref
 };
}
const plan={schema:"HIBOU_IMAGE_PLAN_V1",content_id:"recX",prompt_contract_ref:contractRef,requests:[
 {candidate_id:"S01-C1",scene_id:"S01",candidate:1,seed:10,request:request("S01",10,"A",1)},
 {candidate_id:"S01-C2",scene_id:"S01",candidate:2,seed:11,request:request("S01",11,"B",1)},
 {candidate_id:"S02-C1",scene_id:"S02",candidate:1,seed:20,request:request("S02",20,"C",2)}
]};
const qc={schema:"HIBOU_IMAGE_PERCEPTUAL_QC_V1",scene_summary:{
 S01:{needs_regeneration:true},S02:{needs_regeneration:false}
}};
test("targeted regeneration touches only failed scenes",()=>{
 const r=buildTargetedRegeneration(plan,qc,{attempt:2});
 assert.equal(r.requests.length,2);
 assert.equal(r.regeneration.failed_scenes.length,1);
 assert.equal(r.regeneration.failed_scenes[0],"S01");
 assert.equal(r.regeneration.untouched_scene_count,1);
 assert.ok(r.requests.every(x=>x.scene_id==="S01"));
 assert.equal(r.requests[0].seed,10+200006);
 assert.match(r.requests[0].candidate_id,/S01-R2-C1/);
 assert.equal(r.requests[0].request.overrides["25"].noise_seed,10+200006);
 assert.match(r.requests[0].request.overrides["6"].text,/corriger uniquement les défauts QC/);
 assert.equal(r.requests[0].request.overrides["25"].model_name,"flux1-schnell-fp8.safetensors");
 assert.notEqual(r.requests[0].request.prompt_application.compiled_prompt_sha256,plan.requests[0].request.prompt_application.compiled_prompt_sha256);
 assert.equal(r.requests[0].request.prompt_application.regeneration.base_compiled_prompt_sha256,plan.requests[0].request.prompt_application.compiled_prompt_sha256);
 assert.equal(r.requests[0].request.seed_application.seed,10+200006);
 assert.deepEqual(r.requests[0].request.prompt_contract_ref,plan.requests[0].request.prompt_contract_ref);
 assert.deepEqual(r.prompt_contract_ref,plan.prompt_contract_ref);
});
test("invalid attempt fails closed",()=>{
 assert.throws(()=>buildTargetedRegeneration(plan,qc,{attempt:0}),/positive integer/);
});
