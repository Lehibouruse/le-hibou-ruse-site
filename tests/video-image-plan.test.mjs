import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildImagePlan, normalizeSizeBinding } from "../scripts/video-image-plan.mjs";

const contract={contract_version:"HIBOU_VIDEO_CONTRACT_V1",contract_state:"storyboard",content:{content_id:"recX"},scenes:[
 {scene_id:"S01",image_prompt:"prompt one",visual_idea:"v1"},
 {scene_id:"S02",image_prompt:"prompt two",visual_idea:"v2"}
]};
const dir=mkdtempSync(join(tmpdir(),"hibou-image-plan-"));
const workflowPath=join(dir,"workflow.json");
writeFileSync(workflowPath,JSON.stringify({
  "5":{class_type:"EmptyLatentImage",inputs:{width:1024,height:1024,batch_size:1}},
  "6":{class_type:"CLIPTextEncode",inputs:{text:""}},
  "25":{class_type:"RandomNoise",inputs:{noise_seed:1}},
  "9":{class_type:"SaveImage",inputs:{}}
}));
const binding={workflow_path:workflowPath,prompt:{node_id:"6",input:"text"},seed:{node_id:"25",input:"noise_seed"},size:{node_id:"5",width_input:"width",height_input:"height",batch_input:"batch_size"},profile:{width:768,height:1344,batch_size:1},fallback_profile:{width:640,height:1136,batch_size:1},output_node_ids:["9"],style_prefix:"Hibou"};
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


test("image plan repairs a missing size binding from the real API workflow",()=>{
 const broken=structuredClone(binding);
 broken.size=null;
 const normalized=normalizeSizeBinding(broken);
 assert.equal(normalized.size.node_id,"5");
 assert.equal(normalized.size_binding_repaired,true);
 const p=buildImagePlan(contract,broken);
 assert.equal(p.size_binding.node_id,"5");
 assert.equal(p.size_binding_repaired,true);
});

test("image plan auto-migrates stale non-vertical profiles to verified ROG portrait sizes",()=>{
 const broken=structuredClone(binding);
 broken.profile={width:512,height:768,batch_size:1};
 broken.fallback_profile={width:512,height:768,batch_size:1};
 const normalized=normalizeSizeBinding(broken);
 assert.deepEqual(normalized.profile,{width:768,height:1344,batch_size:1});
 assert.deepEqual(normalized.fallback_profile,{width:640,height:1136,batch_size:1});
 assert.equal(normalized.profile_migrated,true);
 assert.equal(normalized.profile_migration.reason,"legacy_non_vertical_profile");
 assert.equal(normalized.hardware_profile_id,"ROG_G814JI_RTX4070_8GB_V1");
 const p=buildImagePlan(contract,broken);
 assert.equal(p.profile.width,768);
 assert.equal(p.profile.height,1344);
 assert.equal(p.fallback_profile.width,640);
 assert.equal(p.fallback_profile.height,1136);
 assert.equal(p.profile_migrated,true);
 assert.equal(p.requests[0].request.overrides["5"].width,768);
 assert.equal(p.requests[0].request.overrides["5"].height,1344);
 assert.equal(p.requests[0].fallback_request.overrides["5"].width,640);
 assert.equal(p.requests[0].fallback_request.overrides["5"].height,1136);
});


test("image plan preserves an already-valid vertical custom profile",()=>{
 const custom=structuredClone(binding);
 custom.profile={width:704,height:1216,batch_size:1};
 custom.fallback_profile={width:640,height:1136,batch_size:1};
 const normalized=normalizeSizeBinding(custom);
 assert.deepEqual(normalized.profile,{width:704,height:1216,batch_size:1});
 assert.equal(normalized.profile_migrated,false);
});
