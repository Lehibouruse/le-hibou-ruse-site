import assert from "node:assert/strict";
import test from "node:test";
import { buildImagePlan } from "../scripts/video-image-plan.mjs";

const contract={contract_version:"HIBOU_VIDEO_CONTRACT_V1",contract_state:"storyboard",content:{content_id:"recX"},scenes:[
 {scene_id:"S01",image_prompt:"prompt one",visual_idea:"v1"},
 {scene_id:"S02",image_prompt:"prompt two",visual_idea:"v2"}
]};
const binding={workflow_path:"/local/workflow.json",prompt:{node_id:"6",input:"text"},seed:{node_id:"25",input:"noise_seed"},output_node_ids:["9"],style_prefix:"Hibou"};
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
