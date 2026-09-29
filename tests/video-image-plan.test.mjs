import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildImagePlan as buildImagePlanSource, normalizeProductionMode, normalizeSizeBinding } from "../scripts/video-image-plan.mjs";
import { buildPromptContractV2 } from "../scripts/video-layer-guard.mjs";

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
function buildImagePlan(input,bindingArg=binding){
 const strict=structuredClone(input);
 delete strict.prompt_contract_v2;
 strict.prompt_contract_v2=buildPromptContractV2(strict);
 return buildImagePlanSource(strict,bindingArg);
}
test("image plan fails closed without Prompt Contract V2",()=>{
 assert.throws(()=>buildImagePlanSource(contract,binding),/strict prompt_contract_v2 required/);
});
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
 assert.match(r.overrides["6"].text,/Hibou/);
 assert.match(r.overrides["6"].text,/SCENE_IMAGE_PROMPT: prompt one/);
 assert.match(r.overrides["6"].text,/SCENE_VISUAL_INTENT: v1/);
 assert.equal(r.prompt_application.schema,"HIBOU_IMAGE_PROMPT_APPLICATION_V2");
 assert.equal(r.prompt_application.prompt_node_id,"6");
 assert.equal(r.prompt_application.prompt_input,"text");
 assert.equal(r.prompt_application.image_prompt_component_included,true);
 assert.equal(r.prompt_application.visual_idea_component_included,true);
 assert.equal(r.prompt_application.preservation.status,"PASS");
 assert.equal(r.prompt_application.preservation.image_prompt_retention_ratio,1);
 assert.equal(r.prompt_application.preservation.visual_idea_retention_ratio,1);
 assert.equal(typeof r.prompt_application.compiled_image_prompt_sha256,"string");
 assert.equal(typeof r.prompt_application.compiled_visual_idea_sha256,"string");
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


test("PREVIEW defaults to one candidate per scene and the lower local profile",()=>{
 const preview=structuredClone(contract);
 preview.production={mode:"preview"};
 const p=buildImagePlan(preview,binding);
 assert.equal(p.production_mode,"preview");
 assert.equal(p.candidates_per_scene,1);
 assert.equal(p.request_count,2);
 assert.equal(p.profile.width,640);
 assert.equal(p.profile.height,1136);
 assert.equal(p.fallback_profile,null);
 assert.equal(p.preview_profile_applied,true);
});

test("FINAL keeps the premium local profile and multi-candidate policy",()=>{
 const final=structuredClone(contract);
 final.production={mode:"final"};
 const p=buildImagePlan(final,binding);
 assert.equal(p.production_mode,"final");
 assert.equal(p.candidates_per_scene,3);
 assert.equal(p.request_count,6);
 assert.equal(p.profile.width,768);
 assert.equal(p.fallback_profile.width,640);
 assert.equal(p.preview_profile_applied,false);
});

test("unknown production modes fail closed",()=>{
 assert.throws(()=>normalizeProductionMode("turbo"),/preview or final/);
});


test("Airtable renders fail closed when the GLOBAL + SPECIFIC creative contract is missing",()=>{
 const bad=structuredClone(contract);
 bad.content={
   ...bad.content,
   source:"airtable",
   method_version:"VIDEO_METHOD_V4.3",
   profile_version:"2.5-V4.3"
 };
 assert.throws(
   ()=>buildImagePlan(bad,binding),
   /Airtable creative contract incomplete; refusing generic render/
 );
});

test("Airtable renders inject GLOBAL locks, SPECIFIC brief and text-free character-overlay rules into FLUX",()=>{
 const good=structuredClone(contract);
 good.content={
   ...good.content,
   source:"airtable",
   method_version:"VIDEO_METHOD_V4.3",
   profile_version:"2.5-V4.3"
 };
 good.creative={
   style_lock:"GLOBAL_STYLE_LOCK premium editorial cartoon",
   negative_prompt:"NO humans, no photorealism, no identity drift",
   character_lock:"CHARACTER_BIBLE canonical dandy owl with yellow eyes and gold monocle",
   content_brief:"SPECIFIC_BRIEF Lombard vs Box Spread",
   reference_mode:"deterministic_character_overlay",
   text_in_generated_images:false
 };
 good.scenes[0].framing={hibou:true};
 good.scenes[1].framing={hibou:false};
 const p=buildImagePlan(good,binding);
 assert.equal(p.creative_contract_enforced,true);
 const promptWithHibou=p.requests.find(x=>x.scene_id==="S01").request.overrides["6"].text;
 assert.match(promptWithHibou,/ENVIRONMENT_ONLY_COMPOSITION/);
 assert.match(promptWithHibou,/GLOBAL_STYLE_LOCK premium editorial cartoon/);
 assert.doesNotMatch(promptWithHibou,/\b(?:hibou|owl|bird|animal|mascot|mascotte)\b/i);
 assert.doesNotMatch(promptWithHibou,/SPECIFIC_BRIEF Lombard vs Box Spread/);
 assert.equal(p.creative_routing.specific_content_brief_present,true);
 assert.equal(p.creative_routing.specific_payload_authoritative,true);
 assert.equal(p.creative_routing.scene_image_prompt_applied,true);
 assert.equal(p.creative_routing.visual_idea_compiled_as_supplement,true);
 assert.equal(p.creative_routing.compiled_prompt_hash_bound,true);
 assert.match(promptWithHibou,/SCENE_IMAGE_PROMPT: prompt one/);
 assert.match(promptWithHibou,/SCENE_VISUAL_INTENT: v1/);
 assert.doesNotMatch(promptWithHibou,/ABSOLUTELY AVOID/);
 assert.match(promptWithHibou,/CLEAN_SURFACE_LOCK/);
 assert.equal(p.creative_routing.global_negative_policy_present,true);
 assert.equal(p.creative_routing.global_negative_policy_injected_as_literal_tokens,false);
 assert.match(promptWithHibou,/FRAMING_LOCK/);
 assert.match(promptWithHibou,/STYLE_RENDERING_GUIDE: flat vector-like 2D editorial illustration/);
 const promptWithoutHibou=p.requests.find(x=>x.scene_id==="S02").request.overrides["6"].text;
 assert.match(promptWithoutHibou,/OBJECTS_AND_ENVIRONMENT_COMPOSITION/);
});

test("Airtable renders reject a legacy VIDEO_METHOD_V3 storyboard even when scene prompts exist",()=>{
 const bad=structuredClone(contract);
 bad.content={
   ...bad.content,
   source:"airtable",
   method_version:"VIDEO_METHOD_V3",
   profile_version:"HIBOU_VIRAL_V1@2.0"
 };
 bad.creative={
   style_lock:"style",
   negative_prompt:"negative",
   character_lock:"character",
   content_brief:"specific",
   reference_mode:"deterministic_character_overlay",
   text_in_generated_images:false
 };
 assert.throws(()=>buildImagePlan(bad,binding),/VIDEO_METHOD_V4\.3/);
});


test("visual idea is compiled with image prompt and remains sufficient when image prompt is absent",()=>{
 const both=buildImagePlan(contract,binding);
 const bothPrompt=both.requests.find(x=>x.scene_id==="S01").request.overrides["6"].text;
 assert.match(bothPrompt,/SCENE_IMAGE_PROMPT: prompt one/);
 assert.match(bothPrompt,/SCENE_VISUAL_INTENT: v1/);
 const fallback=structuredClone(contract);
 fallback.scenes[0].image_prompt="";
 const p=buildImagePlan(fallback,binding);
 const prompt=p.requests.find(x=>x.scene_id==="S01").request.overrides["6"].text;
 assert.doesNotMatch(prompt,/SCENE_IMAGE_PROMPT:/);
 assert.match(prompt,/SCENE_VISUAL_INTENT: v1/);
 assert.equal(p.creative_routing.visual_idea_compiled_as_supplement,true);
});


test("deterministic character overlay preserves scene mechanics instead of dropping the whole SPECIFIC sentence",()=>{
 const good=structuredClone(contract);
 good.content={...good.content,source:"airtable",method_version:"VIDEO_METHOD_V4.3",profile_version:"2.5-V4.3"};
 good.creative={
   style_lock:"STYLE: illustration éditoriale 2D premium",
   negative_prompt:"no photorealism",
   character_lock:"canonical character",
   content_brief:"specific",
   reference_mode:"deterministic_character_overlay",
   text_in_generated_images:false
 };
 good.scenes=[
   {
     scene_id:"REMOVE_BANK",
     image_prompt:"Schéma très épuré avec un intermédiaire bancaire au centre d’un flux ; prévoir le Hibou canonique en train de retirer cet intermédiaire. Fond très sobre pour permettre une grande punchline ajoutée en post-production.",
     visual_idea:"",
     framing:{hibou:true,type:"schéma",anchor:"centre"}
   },
   {
     scene_id:"CTA",
     image_prompt:"Décor final premium récurrent de la marque : bureau-bibliothèque financier sobre, guide posé sur le bureau, espace central réservé au Hibou canonique. Prévoir des zones propres pour trois textes successifs ajoutés en post-production.",
     visual_idea:"",
     framing:{hibou:true,type:"plan moyen",anchor:"centre"}
   }
 ];
 const p=buildImagePlan(good,binding);
 const removePrompt=p.requests.find(x=>x.scene_id==="REMOVE_BANK").request.overrides["6"].text;
 assert.match(removePrompt,/intermédiaire bancaire au centre d’un flux/i);
 assert.match(removePrompt,/retirer cet intermédiaire/i);
 assert.doesNotMatch(removePrompt,/\bhibou\b/i);
 const ctaPrompt=p.requests.find(x=>x.scene_id==="CTA").request.overrides["6"].text;
 assert.match(ctaPrompt,/bureau-bibliothèque financier sobre/i);
 assert.match(ctaPrompt,/guide posé sur le bureau/i);
 assert.doesNotMatch(ctaPrompt,/\bhibou\b/i);
});

test("preview never selects a vertical profile below the technical QC floor",()=>{
 const tiny=structuredClone(binding);
 tiny.profile={width:384,height:640,batch_size:1};
 tiny.fallback_profile={width:384,height:640,batch_size:1};
 const preview=structuredClone(contract);
 preview.production={mode:"preview"};
 const p=buildImagePlan(preview,tiny);
 assert.ok(p.profile.width>=512);
 assert.ok(p.profile.height>=896);
 assert.equal(p.profile.width,640);
 assert.equal(p.profile.height,1136);
});


test("macro framing is routed into the FLUX prompt",()=>{
 const good=structuredClone(contract);
 good.content={...good.content,source:"airtable",method_version:"VIDEO_METHOD_V4.3",profile_version:"2.5-V4.3"};
 good.creative={
   style_lock:"STYLE: illustration éditoriale 2D premium",
   negative_prompt:"no photorealism",
   character_lock:"canonical character",
   content_brief:"specific",
   reference_mode:"deterministic_character_overlay",
   text_in_generated_images:false
 };
 good.scenes[0].framing={hibou:true,type:"macro",anchor:"left"};
 const p=buildImagePlan(good,binding);
 const prompt=p.requests.find(x=>x.scene_id==="S01").request.overrides["6"].text;
 assert.match(prompt,/FRAMING_LOCK: tight macro close-up/);
 assert.match(prompt,/overlay-safe area toward left/);
});


test("split-screen framing is routed and literal years are abstracted",()=>{
 const good=structuredClone(contract);
 good.content={...good.content,source:"airtable",method_version:"VIDEO_METHOD_V4.3",profile_version:"2.5-V4.3"};
 good.creative={
   style_lock:"STYLE: illustration éditoriale 2D premium",
   negative_prompt:"no photorealism",
   character_lock:"canonical character",
   content_brief:"specific",
   reference_mode:"deterministic_character_overlay",
   text_in_generated_images:false
 };
 good.scenes=[{
   scene_id:"SPLIT",
   image_prompt:"Split screen timeline 2026 2027 2028 2029 with +1.5 % marker",
   visual_idea:"",
   framing:{hibou:false,type:"split-screen",anchor:"centre"}
 }];
 const p=buildImagePlan(good,binding);
 const prompt=p.requests[0].request.overrides["6"].text;
 assert.match(prompt,/strict two-panel split-screen composition/);
 assert.doesNotMatch(prompt,/2026|2027|2028|2029/);
 assert.doesNotMatch(prompt,/1\.5\s*%/);
 assert.match(prompt,/abstract timeline milestone/);
 assert.match(prompt,/abstract percentage marker/);
});

test("diagram framing compiles to flat diagrammatic composition",()=>{
 const good=structuredClone(contract);
 good.content={...good.content,source:"airtable",method_version:"VIDEO_METHOD_V4.3",profile_version:"2.5-V4.3"};
 good.creative={
   style_lock:"STYLE: illustration éditoriale 2D premium",
   negative_prompt:"no photorealism",
   character_lock:"canonical character",
   content_brief:"specific",
   reference_mode:"deterministic_character_overlay",
   text_in_generated_images:false
 };
 good.scenes=[{
   scene_id:"DIAG",
   image_prompt:"Four abstract finance blocks and arrows",
   visual_idea:"",
   framing:{hibou:false,type:"schéma",anchor:"center"}
 }];
 const p=buildImagePlan(good,binding);
 const prompt=p.requests[0].request.overrides["6"].text;
 assert.match(prompt,/flat diagrammatic editorial composition/);
 assert.match(prompt,/simplified blocks, arrows and icons/);
});
