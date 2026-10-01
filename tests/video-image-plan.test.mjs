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
 assert.match(promptWithHibou,/STRICT_GLYPH_FREE_LOCK/);
 assert.match(promptWithHibou,/No letters, words, digits/);
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
 assert.match(prompt,/four ordered blank timeline milestones linked in sequence/);
 assert.match(prompt,/abstract percentage marker/);
});

test("text-free image compilation strips literal amounts and uppercase financial labels while preserving the mechanism",()=>{
 const good=structuredClone(contract);
 good.content={...good.content,source:"airtable",method_version:"VIDEO_METHOD_V4.3",profile_version:"2.5-V4.3"};
 good.creative={
   style_lock:"STYLE: premium editorial illustration",
   negative_prompt:"no photorealism",
   character_lock:"canonical character",
   content_brief:"specific",
   reference_mode:"deterministic_character_overlay",
   text_in_generated_images:false
 };
 good.scenes=[{
   scene_id:"VALUE",
   image_prompt:"Portefeuille valorisé 100 000 € avec contrat LOMBARD et repère 2029.",
   visual_idea:"Comparer 100 000 € aujourd'hui à 120 000 € plus tard.",
   framing:{hibou:false,type:"schéma",anchor:"center"}
 }];
 const p=buildImagePlan(good,binding);
 const prompt=p.requests[0].request.overrides["6"].text;
 assert.doesNotMatch(prompt,/100\s*000|120\s*000|2029|LOMBARD/);
 assert.match(prompt,/abstract currency marker|abstract unlabeled value marker/);
 assert.match(prompt,/abstract timeline milestone/);
 assert.match(prompt,/STRICT_GLYPH_FREE_LOCK/);
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

test("V2 financial montage survives glyph-free compilation",()=>{
 const specific=structuredClone(contract);
 specific.content={...specific.content,source:"airtable",method_version:"VIDEO_METHOD_V4.3",profile_version:"2.5-V4.3"};
 specific.creative={
   style_lock:"STYLE: illustration éditoriale 2D. ADDITIF V4.4 — préserver les relations financières, les couches et les séquences.",
   negative_prompt:"no critical baked-in text",
   character_lock:"canonical character",
   content_brief:"ADDITIF SPÉCIFIQUE V2",
   reference_mode:"deterministic_character_overlay",
   text_in_generated_images:false
 };
 specific.scenes=[{
   scene_id:"S10",
   image_prompt:"Une timeline financière avec quatre carrés box",
   visual_idea:"SCÈNE 10 — quatre jalons 2026→2027→2028→2029 ; apparitions successives des box ; accélération par succession des beats, pas par un simple zoom ; texte « ROULER LE FINANCEMENT » ajouté en post-production.",
   framing:{hibou:false,type:"schéma",anchor:"center"}
 }];
 const plan=buildImagePlan(specific,binding);
 const request=plan.requests[0].request;
 const prompt=request.overrides["6"].text;
 assert.match(prompt,/four ordered blank timeline milestones linked in sequence/);
 assert.match(prompt,/apparitions successives des box/);
 assert.match(prompt,/succession des beats/);
 assert.match(prompt,/IMAGE_FINANCIAL_MECHANIC_LOCK/);
 assert.doesNotMatch(prompt,/2026|2027|2028|2029|ROULER LE FINANCEMENT/);
 assert.equal(request.prompt_application.preservation.status,"PASS");
});

test("long GLOBAL methodology is summarized for the encoder while SPECIFIC leads the effective prompt",()=>{
 const specific=structuredClone(contract);
 specific.content={...specific.content,source:"airtable",method_version:"VIDEO_METHOD_V4.3",profile_version:"2.5-V4.3"};
 specific.creative={style_lock:"STYLE: premium 2D illustration.\nADDITIF V4.4\n"+
   "non-image methodology archive ".repeat(400),negative_prompt:"no critical baked-in text",
   character_lock:"canonical character",content_brief:"specific",
   reference_mode:"deterministic_character_overlay",text_in_generated_images:false};
 specific.scenes=[{scene_id:"S09",image_prompt:"A blank two-panel financial comparison with distinct layers",
   visual_idea:"One blank margin layer stays left; its copy disappears on the right.",
   framing:{hibou:false,type:"schéma",anchor:"center"}}];
 const request=buildImagePlan(specific,binding).requests[0].request;
 const prompt=request.overrides["6"].text;
 assert(prompt.indexOf("SCENE_IMAGE_PROMPT:")<prompt.indexOf("IMAGE_STYLE_LOCK:"));
 assert.match(prompt,/SCENE_VISUAL_INTENT:/);
 assert.match(prompt,/IMAGE_FINANCIAL_MECHANIC_LOCK:/);
 assert.match(prompt,/STRICT_GLYPH_FREE_LOCK:/);
 assert.doesNotMatch(prompt,/non-image methodology archive/);
 assert(prompt.length<=4096);
 assert.equal(request.prompt_application.effective_prompt_chars,prompt.length);
 assert.equal(request.prompt_application.specific_prompt_prefix_preserved,true);
 assert.equal(request.prompt_application.glyph_free_lock_present,true);
 specific.scenes[0].visual_idea="very long concrete instruction ".repeat(200);
 assert.throws(()=>buildImagePlan(specific,binding),/effective FLUX prompt.*exceeds/);
});

// Exact visual fields from the stopped 2026-09-30 run recvn3jMCkQcOBFvs.
// Keep these as a regression: the long S01 sentence used to collapse to its
// final style sentence, while its separate subject/face instructions survived.
const auditedOverlayScenes=[{
 scene_id:"lombard_box_v1_scene_01_hook",
 image_prompt:"Unbranded contemporary French private-bank interior, restrained and credible, clear reception desk and subtle financial folders, warm ivory, dark green and muted gold palette, clean architectural lines, no marble palace, no luxury lobby cliché, no signage or text, clear empty foreground reserved for the canonical owl character overlay added later. Premium editorial 2D illustration.",
 visual_idea:"Hook : le Hibou est grand au premier plan devant un établissement de banque privée français crédible et sobre. Il tient un contrat LOMBARD. Expression méfiante avec une pointe d’amusement. Architecture bancaire contemporaine, accueillante et lisible, sans luxe de palais ; entrée rapide puis léger zoom avant.",
 framing:{hibou:true,type:"plan moyen",anchor:"centre"}
},{
 scene_id:"lombard_box_v1_scene_05_marge",
 image_prompt:"Schéma financier minimal composé d’une base horizontale représentant le taux de marché et d’une couche supplémentaire ajoutée par une banque stylisée. Intégrer un calendrier graphique simple pouvant suggérer le passage d’une année à la suivante. Aucun texte généré ; tous les labels sont ajoutés ensuite.",
 visual_idea:"Schéma extrêmement simple : base « taux de marché », puis la banque ajoute physiquement une couche de marge. Apparitions successives +1 %, puis +1,5 %. Calendrier qui tourne. Sur la fin, isoler « CHAQUE ANNÉE ».\n\n[ADDITIF SPÉCIFIQUE V2 — MONTAGE] SCÈNE 5 — Quatre beats ordonnés : (1) taux de marché ; (2) taux de marché + marge bancaire de 1 % ; (3) variante exclusive, taux de marché + marge bancaire de 1,5 %, jamais 1 % + 1,5 % ; (4) calendrier et répétition annuelle dans le scénario illustré avec « CHAQUE ANNÉE » dominant. Les beats courts peuvent partager une composition de 2,8–5 s. La marge s'ajoute au taux ; le calendrier n'affirme pas que tous les contrats Lombard sont renouvelés annuellement.",
 framing:{hibou:false,type:"schéma",anchor:"centre"}
}];
function overlayContract(scenes=auditedOverlayScenes){
 const input=structuredClone(contract);
 input.content={...input.content,source:"airtable",method_version:"VIDEO_METHOD_V4.3",profile_version:"2.5-V4.3"};
 input.creative={style_lock:"STYLE: premium 2D editorial illustration. ADDITIF V4.4 — preserve finance relations.",
   negative_prompt:"no humans, no human faces, no photorealism, no critical baked-in text",
   character_lock:"canonical character",content_brief:"specific",
   reference_mode:"deterministic_character_overlay",text_in_generated_images:false};
 input.scenes=structuredClone(scenes);
 return input;
}

test("audited S01 retains the specific bank environment and finance props without orphaned character instructions",()=>{
 const input=overlayContract();
 const before=structuredClone(input);
 const request=buildImagePlan(input,binding).requests[0].request;
 const prompt=request.overrides["6"].text;
 const scenePrompt=prompt.split("SCENE_IMAGE_PROMPT: ")[1].split("\n")[0];
 for(const detail of ["contemporary French private-bank interior","reception desk","financial folders",
   "warm ivory","dark green and muted gold palette","clean architectural lines","no marble palace",
   "no luxury lobby cliché","clear empty foreground"]){
   assert.ok(scenePrompt.includes(detail),`S01 lost its scene-specific detail: ${detail}`);
 }
 assert.match(prompt,/un établissement de banque privée français crédible et sobre/);
 assert.match(prompt,/Objet financier posé dans le décor : un contrat unlabeled concept/);
 assert.match(prompt,/Architecture bancaire contemporaine/);
 assert.match(prompt,/léger zoom avant/);
 assert.doesNotMatch(prompt,/\b(?:hibou|owl|bird|mascot|mascotte)\b|\bIl tient\b|Expression méfiante|entrée rapide/iu);
 assert.ok(request.prompt_application.preservation.image_prompt_retention_ratio>0.7);
 assert.deepEqual(input,before,"compilation must not rewrite the source storyboard or its strict payload");
});

test("generation safety leads the prompt while S01 scene detail remains ahead of GLOBAL style",()=>{
 const request=buildImagePlan(overlayContract(),binding).requests[0].request;
 const prompt=request.overrides["6"].text;
 assert.ok(prompt.startsWith("IMAGE_SAFETY_PREFIX: Empty environment. No people, faces, characters, text or glyphs. Blank unmarked surfaces.\nSCENE_IMAGE_PROMPT: Unbranded contemporary French private-bank interior"));
 assert.ok(prompt.indexOf("reception desk")<prompt.indexOf("SCENE_VISUAL_INTENT:"));
 assert.ok(prompt.indexOf("SCENE_IMAGE_PROMPT:")<prompt.indexOf("IMAGE_STYLE_LOCK:"));
 assert.ok(prompt.indexOf("STRICT_GLYPH_FREE_LOCK:")>prompt.indexOf("SCENE_IMAGE_PROMPT:"));
 assert.equal(request.prompt_application.specific_prompt_prefix_preserved,true);
 assert.equal(request.prompt_application.safety_prefix_present,true);
});

test("audited S05 keeps its base-plus-margin, exclusive variants and ordered annual mechanism",()=>{
 const input=overlayContract();
 const request=buildImagePlan(input,binding).requests.find(x=>x.scene_id.endsWith("05_marge")).request;
 const prompt=request.overrides["6"].text;
 assert.match(prompt,/base horizontale représentant le taux de marché et d’une couche supplémentaire ajoutée par une banque stylisée/);
 assert.match(prompt,/la banque ajoute physiquement une couche de marge/);
 assert.match(prompt,/Quatre beats ordonnés/);
 assert.match(prompt,/taux de marché \+ marge bancaire de abstract percentage marker/);
 assert.match(prompt,/variante exclusive/);
 assert.match(prompt,/jamais abstract percentage marker \+ abstract percentage marker/);
 assert.match(prompt,/calendrier et répétition annuelle dans le scénario illustré/);
 assert.match(prompt,/La marge s'ajoute au taux/);
 assert.match(prompt,/n'affirme pas que tous les contrats Lombard sont renouvelés annuellement/);
 assert.doesNotMatch(prompt,/1\s*%|1,5\s*%|CHAQUE ANNÉE/);
 assert.equal(request.prompt_application.preservation.status,"PASS");
 assert.equal(request.prompt_application.preservation.character_overlay_sanitized,false);
});

test("overlay sanitation preserves comma-separated financial relations and decimal markers while replacing held props",()=>{
 const input=overlayContract([{
   scene_id:"MIXED",image_prompt:"Deux blocs reliés de gauche à droite, base puis couche de marge de 1,5 %, espace réservé au Hibou canonique.",
   visual_idea:"He holds his financial folder in his right hand. Facial expression suspicious. Arrows point toward him.",
   framing:{hibou:true,type:"schéma",anchor:"centre"}
 }]);
 const prompt=buildImagePlan(input,binding).requests[0].request.overrides["6"].text;
 assert.match(prompt,/Deux blocs reliés de gauche à droite/);
 assert.match(prompt,/base puis couche de marge de abstract percentage marker/);
 assert.match(prompt,/Objet financier posé dans le décor : the financial folder/);
 assert.match(prompt,/Arrows point toward a central empty area/);
 assert.doesNotMatch(prompt,/\b(?:hibou|he|him|his|hand)\b|Facial expression|1,5/iu);
});

const reviewedOverlayScenes=[{
 scene_id:"lombard_box_v1_scene_07_four_options",
 image_prompt:"Quatre cartes financières abstraites, distinctes mais simples, convergent vers une seule flèche de cash ou un flux financier central. Prévoir une zone d’arrivée pour le Hibou canonique. Ne représenter aucun jargon technique.",
 visual_idea:"Quatre cartes/options distinctes convergent vers une seule flèche de cash dirigée vers le Hibou. Aucun call/put à l’écran.\n\n[ADDITIF SPÉCIFIQUE V2 — MONTAGE] SCÈNE 7 — Quatre jambes/options distinctes, coordonnées en deux paires partageant la même échéance, convergent vers un seul financement/cash. Pour le scénario illustré, la personne qui reçoit le cash est vendeuse du box ; ne pas confondre ce flux avec le box acheté. Les quatre jambes, leurs appariements et leur convergence doivent rester visibles sur téléphone sans jargon call/put à l'écran. Ce schéma pédagogique porte sur des options de type européen à règlement en espèces ; ne pas suggérer que quatre cartes arbitraires ou toutes les options produisent le même résultat.",
 framing:{hibou:true,type:"schéma",anchor:"centre"}
},{
 scene_id:"lombard_box_v1_scene_08_today_maturity",
 image_prompt:"Composition financière éditoriale 2D premium en split-screen vertical. Côté gauche : cash disponible aujourd’hui, représenté par une pile de billets ou une mallette de cash, avec espace propre pour un callout ajouté en post-production. Côté droit : échéance future clairement matérialisée par un calendrier/date et un montant de remboursement verrouillé/connu, reliés par une ligne temporelle simple. Aucun humain, aucun animal, aucun texte généré dans l’image.",
 visual_idea:"Split-screen lisible : à gauche le cash encaissé aujourd’hui ; à droite une échéance future avec le montant de remboursement déjà connu. Une ligne temporelle relie les deux. Le Hibou n’est pas nécessaire dans cette scène : priorité à la compréhension immédiate du mécanisme.\n\n[ADDITIF SPÉCIFIQUE V2 — MONTAGE] SCÈNE 8 — Vrai comparatif temporel gauche/droite du même box : cash reçu aujourd'hui à gauche ; montant de remboursement connu à l'échéance à droite ; connexion temporelle explicite entre les deux. La certitude du montant s'applique au box illustré jusqu'à cette échéance, pas à un renouvellement ultérieur.",
 framing:{hibou:false,type:"split-screen",anchor:"centre"}
},{
 scene_id:"lombard_box_v1_scene_12_one_less",
 image_prompt:"Schéma très épuré avec un intermédiaire bancaire au centre d’un flux ; prévoir le Hibou canonique en train de retirer cet intermédiaire. Fond très sobre pour permettre une grande punchline ajoutée en post-production.",
 visual_idea:"Le Hibou efface la banque située au milieu du schéma. Ensuite ne laisser que la phrase principale très grande, sans concurrence visuelle.\n\n[ADDITIF SPÉCIFIQUE V2 — MONTAGE] SCÈNE 12 — Le Hibou canonique retire graphiquement la banque prêteuse située au milieu du circuit de financement, devant le spectateur, puis le circuit se simplifie et la phrase « UN INTERMÉDIAIRE DE MOINS. » domine seule. L'action doit précéder l'état final ; elle ne représente pas la disparition du courtier, des frais, des garanties ou des risques.",
 framing:{hibou:true,type:"schéma",anchor:"centre"}
}];

test("audited S12 preserves the negated disclaimer and its complete list rather than treating action as a person",()=>{
 const input=overlayContract([reviewedOverlayScenes[2]]);
 const before=structuredClone(input);
 const request=buildImagePlan(input,binding).requests[0].request;
 const prompt=request.overrides["6"].text;
 assert.match(prompt,/Cette action ne représente pas la disparition du courtier, des frais, des garanties ou des risques\./);
 assert.match(prompt,/L'action doit précéder l'état final/);
 assert.match(prompt,/retirer graphiquement la banque prêteuse située au milieu du circuit de financement/);
 assert.doesNotMatch(prompt,/\b(?:hibou|elle)\b|\. des frais\. /iu);
 assert.deepEqual(input,before,"the montage's authoritative disclaimer must remain unchanged at source");
});

test("audited S07 replaces the visible-person role with the sold-box cash relation while preserving paired legs",()=>{
 const input=overlayContract([reviewedOverlayScenes[0]]);
 const before=structuredClone(input);
 const request=buildImagePlan(input,binding).requests[0].request;
 const prompt=request.overrides["6"].text;
 assert.match(prompt,/Quatre cartes\/options distinctes convergent vers une seule flèche de cash dirigée vers un nœud financier bénéficiaire/);
 assert.match(prompt,/la vente du box produit le flux de cash reçu/);
 assert.match(prompt,/deux paires partageant la même échéance/);
 assert.match(prompt,/ne pas confondre ce flux avec le box acheté/);
 assert.match(prompt,/options de type européen à règlement en espèces/);
 assert.doesNotMatch(prompt,/la personne|vendeuse|\b(?:hibou|owl)\b/iu);
 assert.deepEqual(input,before,"the precise seller/recipient role remains authoritative for postproduction");
});

test("audited object-only S08 removes canonical character mentions despite framing.hibou false",()=>{
 const input=overlayContract([reviewedOverlayScenes[1]]);
 const request=buildImagePlan(input,binding).requests[0].request;
 const prompt=request.overrides["6"].text;
 assert.doesNotMatch(prompt,/\b(?:hibou|owl|bird|animal|mascot|mascotte)\b/iu);
 assert.match(prompt,/cash encaissé aujourd’hui/);
 assert.match(prompt,/échéance future avec le montant de remboursement déjà connu/);
 assert.match(prompt,/connexion temporelle explicite entre les deux/);
 assert.match(prompt,/pas à un renouvellement ultérieur/);
 assert.match(prompt,/OBJECTS_AND_ENVIRONMENT_COMPOSITION/);
 assert.equal(request.prompt_application.preservation.background_character_tokens_forbidden,true);
 assert.equal(request.prompt_application.preservation.character_overlay_sanitized,false);
});
