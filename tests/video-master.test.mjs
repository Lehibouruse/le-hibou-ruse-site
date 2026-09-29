import assert from "node:assert/strict";
import test from "node:test";
import { buildTechnicalSelections, masterPolicy, materializeSpecificActionTimelines, normalizeExecutionProfileOverride } from "../scripts/video-master.mjs";

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

test("job-level preview execution override is bounded and does not imply publication",()=>{
 const p=normalizeExecutionProfileOverride({mode:"preview",candidates:"1"});
 assert.deepEqual(p,{production_mode:"preview",candidates_per_scene:1});
 assert.throws(()=>normalizeExecutionProfileOverride({mode:"turbo",candidates:"1"}),/preview or final/);
 assert.throws(()=>normalizeExecutionProfileOverride({mode:"preview",candidates:"4"}),/1\.\.3/);
});
