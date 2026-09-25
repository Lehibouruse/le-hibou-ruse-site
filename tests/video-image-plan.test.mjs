import assert from "node:assert/strict";
import test from "node:test";
import { buildImagePlan } from "../scripts/video-image-plan.mjs";

const contract={contract_version:"HIBOU_VIDEO_CONTRACT_V1",contract_state:"storyboard",content:{content_id:"recX"},scenes:[
 {scene_id:"S01",image_prompt:"prompt one",visual_idea:"v1"},
 {scene_id:"S02",image_prompt:"prompt two",visual_idea:"v2"}
]};
const binding={workflow_path:"/local/workflow.json",prompt:{node_id:"6",input:"text"},seed:{node_id:"25",input:"noise_seed"},size:{node_id:"5",width_input:"width",height_input:"height",batch_input:"batch_size"},profile:{width:768,height:1344,batch_size:1},fallback_profile:{width:640,height:1136,batch_size:1},output_node_ids:["9"],style_prefix:"Hibou"};
test("image plan creates exactly 3 deterministic candidates per scene",()=>{
 const a=buildImagePlan(contract,binding); const b=buildImagePlan(contract,binding);
 assert.equal(a.request_count,6); assert.equal(a.candidates_per_scene,3);
 assert.deepEqual(a.requests.map(x=>x.seed),b.requests.map(x=>x.seed));
 assert.equal(new Set(a.requests.slice(0,3).map(x=>x.seed)).size,3);
 assert.equal(a.paid_fallback,false);
});
test("image plan binds only declared workflow prompt and seed inputs",()=>{
 const p=buildImagePlan(contract,binding);
 const r=p.requests[0].request;
 assert.equal(r.overrides["6"].text,"Hibou prompt one");
 assert.equal(typeof r.overrides["25"].noise_seed,"number");
 assert.equal(r.endpoint,"http://127.0.0.1:8188");
});

test("image plan preserves prompt/seed while preparing a lower-resolution local fallback",()=>{
 const p=buildImagePlan(contract,binding);
 const item=p.requests[0];
 assert.equal(item.request.overrides["5"].width,768);
 assert.equal(item.request.overrides["5"].height,1344);
 assert.equal(item.fallback_request.overrides["5"].width,640);
 assert.equal(item.fallback_request.overrides["5"].height,1136);
 assert.equal(item.request.overrides["25"].noise_seed,item.fallback_request.overrides["25"].noise_seed);
 assert.equal(item.request.overrides["6"].text,item.fallback_request.overrides["6"].text);
});

test("image plan skips FULL_REUSE scenes and generates only unresolved scenes",()=>{
 const mixed=structuredClone(contract);
 mixed.scenes[0].asset_resolution={status:"FULL_REUSE"};
 const p=buildImagePlan(mixed,binding);
 assert.equal(p.request_count,3);
 assert.equal(p.generation_scene_count,1);
 assert.deepEqual(p.skipped_full_reuse,["S01"]);
 assert.equal(new Set(p.requests.map(x=>x.scene_id)).has("S01"),false);
});
