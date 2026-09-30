import assert from "node:assert/strict";
import { join } from "node:path";
import test from "node:test";
import { buildCompositionTimingQc, buildTechnicalSelections, imagePromptPreservationPass, masterPolicy, materializeSpecificActionTimelines, normalizeExecutionProfileOverride, runtimeBundleDir, unverifiedSpecificMontageActions } from "../scripts/video-master.mjs";
import { buildMotionPlan } from "../scripts/video-motion-plan.mjs";
import { buildSceneCompositePlan } from "../scripts/video-scene-compositor.mjs";

test("master orchestrator is bounded and publication locked",()=>{
 const p=masterPolicy();
 assert.equal(p.max_scenes,20);
 assert.equal(p.regeneration_attempts,1);
 assert.equal(p.publication_authorized,false);
 assert.equal(p.human_master_review_required,true);
 assert.equal(p.paid_fallback,false);
});
test("master policy refuses unbounded runs",()=>{
 assert.throws(()=>masterPolicy({maxScenes:26}),/1\.\.25/);
 assert.throws(()=>masterPolicy({regenAttempts:3}),/0\.\.2/);
});

test("local runtime overrides use separate cache directories for every bundle",()=>{
 const commit="a".repeat(40);
 const localAppData=join("C:\\","hibou-test-cache");
 for(const kind of ["pre-image-runtime","image-runtime","post-runtime"]){
   const pinned=runtimeBundleDir(kind,commit,{localAppData,localOverride:false});
   const override=runtimeBundleDir(kind,commit,{localAppData,localOverride:true});
   assert.equal(override,join(pinned,"local-override"));
   assert.notEqual(override,pinned);
 }
});
test("technical selections promote only QC PASS provisional candidates",()=>{
 const s=buildTechnicalSelections({
   S01:{status:"PROVISIONAL_QC_PASS",selected_path:"a.png"},
   S02:{status:"PROVISIONAL_QC_PASS",selected_path:"b.png"}
 });
 assert.equal(s.S01.selected,"a.png");
 assert.match(s.S01.selection_reason,/final master human review required/);
 assert.throws(()=>buildTechnicalSelections({S01:{status:"NO_PASS",selected_path:null}}),/no QC PASS image/);
});


test("SPECIFIC temporal cues are compiled into deterministic camera/accent beats without rewriting prompts",()=>{
 const contract={scenes:[
   {scene_id:"S01",order:1,planned_duration_s:6,visual_idea:"Le Hibou efface la banque puis le passage s’ouvre.",image_prompt:"keep me",timeline:null},
   {scene_id:"S02",order:2,planned_duration_s:5,visual_idea:"Décor stable.",image_prompt:"unchanged",timeline:{events:[{id:"manual",type:"camera",start_s:0,end_s:2,zoom_percent:3}]}}
 ]};
 const before=contract.scenes.map(s=>({image_prompt:s.image_prompt,visual_idea:s.visual_idea}));
 const compiled=materializeSpecificActionTimelines(contract);
 assert.equal(compiled.changed_scene_count,1);
 assert.equal(compiled.prompt_text_mutated,false);
 assert.equal(contract.scenes[0].timeline.source,"compiled_specific_action_cues_v1");
 assert(contract.scenes[0].timeline.action_cues.includes("erase_remove"));
 assert(contract.scenes[0].timeline.action_cues.includes("open_passage"));
 assert.equal(contract.scenes[0].timeline.events[0].type,"camera");
 assert.equal(contract.scenes[0].timeline.events[1].type,"accent");
 assert.equal(contract.scenes[1].timeline.events[0].id,"manual");
 assert.deepEqual(contract.scenes.map(s=>({image_prompt:s.image_prompt,visual_idea:s.visual_idea})),before);
 const secondPass=materializeSpecificActionTimelines(contract);
 assert.equal(secondPass.changed_scene_count,0);
});

test("acceleration cues receive a second camera beat",()=>{
 const contract={scenes:[{scene_id:"S10",order:10,planned_duration_s:7,visual_idea:"Un bloc est recréé puis accélération progressive.",image_prompt:"timeline"}]};
 const compiled=materializeSpecificActionTimelines(contract);
 assert.equal(compiled.changed_scene_count,1);
 assert.equal(contract.scenes[0].timeline.events.filter(e=>e.type==="camera").length,2);
 assert(contract.scenes[0].timeline.action_cues.includes("renew_recreate"));
 assert(contract.scenes[0].timeline.action_cues.includes("accelerate"));
});

test("image prompt application cannot pass when primary or fallback preservation needs review",()=>{
 const primary={request:{prompt_application:{preservation:{status:"PASS"}}}};
 const fallback={...primary,fallback_request:{prompt_application:{preservation:{status:"PASS"}}}};
 assert.equal(imagePromptPreservationPass([primary,fallback]),true);
 assert.equal(imagePromptPreservationPass([{request:{prompt_application:{preservation:{status:"REVIEW"}}}}]),false);
 assert.equal(imagePromptPreservationPass([{...fallback,fallback_request:{prompt_application:{preservation:{status:"REVIEW"}}}}]),false);
 assert.equal(imagePromptPreservationPass([{request:{}}]),false);
});

test("camera and accent beats cannot certify V2 montage mechanisms",()=>{
 const contract={
   contract_version:"HIBOU_VIDEO_CONTRACT_V1",
   creative:{movement_profile:"HYBRID_BEATS"},
   scenes:[
     {scene_id:"S01",order:1,visual_idea:"La marge disparaît.",planned_duration_s:5},
     {scene_id:"S02",order:2,visual_idea:"Un bloc est recréé à chaque échéance.",planned_duration_s:5},
     {scene_id:"S03",order:3,visual_idea:"Le Hibou efface la banque.",planned_duration_s:5},
     {scene_id:"S04",order:4,visual_idea:"Décor fixe.",planned_duration_s:5},
     {scene_id:"S05",order:5,visual_idea:"Quatre blocs convergent.\n[ADDITIF SPÉCIFIQUE V2 — MONTAGE] SCÈNE 7 — 4 options vers un financement.",planned_duration_s:5},
   ]
 };
 materializeSpecificActionTimelines(contract);
 const motionPlan=buildMotionPlan(contract);
 assert.equal(motionPlan.specific_execution_gap_count,0);
 assert.deepEqual(unverifiedSpecificMontageActions(contract).map(gap=>gap.scene_id),["S01","S02","S03","S05"]);
 assert.equal(unverifiedSpecificMontageActions(contract)[3].specific_v2_montage_required,true);
 assert.deepEqual(unverifiedSpecificMontageActions(motionPlan).map(gap=>gap.scene_id),["S01","S02","S03"]);
 assert.equal(unverifiedSpecificMontageActions({scenes:[motionPlan.scenes[3]]}).length,0);
});

test("Box Spread V2 scenes receive typed post-production diagrams with verified before/after states",()=>{
 const contract={content:{content_id:"rec8lgQT8jXreflmt"},scenes:Array.from({length:8},(_,i)=>({
   scene_id:`S${String(i+5).padStart(2,"0")}`,order:i+5,
   planned_duration_s:[9,5,8,6,7,7,7,4][i],
   visual_idea:i===1?"La banque disparaît et ouvre un passage.":
     `[ADDITIF SPÉCIFIQUE V2 — MONTAGE] SCÈNE ${i+5} — préserver la relation financière.`,
   image_prompt:`Base scène ${i+5}`
 }))};
 const original=contract.scenes.map(scene=>scene.visual_idea);
 const applied=materializeSpecificActionTimelines(contract);
 assert.equal(applied.changed_scene_count,8);
 assert.deepEqual(unverifiedSpecificMontageActions(contract),[]);
 assert.deepEqual(contract.scenes.map(scene=>scene.visual_idea),original);
 for(const scene of contract.scenes){
   const diagrams=scene.timeline.events.filter(event=>event.type==="diagram");
   assert(diagrams.length>=2);
   assert(scene.timeline.specific_montage.visual_units.every(unit=>unit.duration_s>=2.8&&unit.duration_s<=5));
   const render=buildSceneCompositePlan({
     ...scene,composition:{background:"bg.png",camera_transform:{zoom_percent:2.5,anchor:"center"}}
   },{duration:scene.planned_duration_s});
   assert.match(render.filter_complex,/diagram-panel/);
   assert.equal(render.timeline.events.filter(event=>event.type==="diagram").length,diagrams.length);
 }
 const removeScene=contract.scenes.find(scene=>scene.scene_id==="S12");
 assert(removeScene.timeline.events.some(event=>event.action?.operation==="remove"&&event.action.target_layer_id==="bank"));
 const roll=contract.scenes.find(scene=>scene.scene_id==="S10");
 assert.deepEqual(roll.timeline.events.filter(event=>event.type==="diagram").map(event=>event.diagram.nodes.at(-1).label),
   ["2026 BOX","2027 BOX","2028 BOX","2029 BOX"]);
 const fourOptions=contract.scenes.find(scene=>scene.scene_id==="S07");
 assert.equal(fourOptions.timeline.events.at(-1).diagram.links.filter(link=>link.kind==="line").length,6);
 assert.equal(materializeSpecificActionTimelines(contract).changed_scene_count,0);
 contract.scenes[7].timeline.events.find(event=>event.type==="diagram").diagram.nodes[1].label="FAUX";
 assert.equal(unverifiedSpecificMontageActions(contract)[0].scene_id,"S12");
});

test("Box Spread timing audit divides long scenes and limits final CTA to three seconds",()=>{
 const contract={content:{content_id:"rec8lgQT8jXreflmt"},creative:{pacing:{scene_duration_target_s:[2.8,5]}},scenes:[
   {scene_id:"S03",order:3,planned_duration_s:6,visual_idea:"Cash sans vendre."},
   {scene_id:"S05",order:5,planned_duration_s:9,visual_idea:"[ADDITIF SPÉCIFIQUE V2 — MONTAGE] Scène 5."},
   {scene_id:"S13",order:13,planned_duration_s:5,visual_idea:"Invitation finale."}
 ]};
 materializeSpecificActionTimelines(contract);
 const report=buildCompositionTimingQc(contract);
 assert.equal(report.pass,true);
 assert.deepEqual(report.scenes.map(scene=>scene.visual_units.length),[2,2,1]);
 assert.equal(report.cta.active_duration_s,3);
 assert.equal(contract.scenes[2].timeline.events[1].start_s,2);
 contract.scenes[2].timeline.cta_window.active_duration_s=4;
 assert.equal(buildCompositionTimingQc(contract).pass,false);
});

test("job-level preview execution override is bounded and does not imply publication",()=>{
 const p=normalizeExecutionProfileOverride({mode:"preview",candidates:"1"});
 assert.deepEqual(p,{production_mode:"preview",candidates_per_scene:1});
 assert.throws(()=>normalizeExecutionProfileOverride({mode:"turbo",candidates:"1"}),/preview or final/);
 assert.throws(()=>normalizeExecutionProfileOverride({mode:"preview",candidates:"4"}),/1\.\.3/);
});
