import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluatePromptContractRun } from "../scripts/video-prompt-contract-verdict.mjs";

const goodApp={
  schema:"HIBOU_IMAGE_PROMPT_APPLICATION_V2",
  compiled_prompt_sha256:"a".repeat(64),
  image_prompt_component_included:true,
  visual_idea_component_included:true,
  preservation:{status:"PASS",raw_image_prompt_chars:20,image_prompt_retention_ratio:0.6,
    raw_visual_idea_chars:20,visual_idea_retention_ratio:0.7}
};

const goodReceipt={
  schema:"HIBOU_COMFY_PROMPT_EXECUTION_V1",
  prompt_verified:true,
  compiled_prompt_sha256:"a".repeat(64),
  applied_prompt_sha256:"a".repeat(64),
  workflow_sha256:"b".repeat(64)
};

function fixture(){
  const root=mkdtempSync(join(tmpdir(),"hibou-verdict-"));
  const put=(name,value)=>{
    const path=join(root,name);
    mkdirSync(join(path,".."),{recursive:true});
    writeFileSync(path,typeof value==="string"?value:JSON.stringify(value));
  };
  put("storyboard.json",{content:{source:"airtable"},production:{final_candidates_per_scene:2},
    creative:{production_defaults:{image_qc_threshold:85},pacing:{scene_duration_target_s:[2.8,5]}},scenes:[{
    scene_id:"S01",visual_idea:"four options converge to cash",
    image_prompt:"diagram with four options",planned_duration_s:4
  }]});
  put("pipeline-run.json",{stages:Object.fromEntries(
    ["images","generated_text_qc","technical_selection","creative_qc","render","master_qc"].map(name=>[name,{status:"PASS"}])
  )});
  put("airtable-source-freshness.json",{pass:true,live_at_run:false});
  put("prompt-propagation.json",{pass:true});
  put("prompt-contract-continuity.json",{pass:true,coverage_pct:100});
  put("specific-action-montage-audit.json",{pass:true});
  put("images/image-plan.json",{requests:[{
    scene_id:"S01",candidate_id:"S01-C1",
    request:{prompt_application:goodApp},
    fallback_request:{prompt_application:goodApp}
  },{scene_id:"S01",candidate_id:"S01-C2",request:{prompt_application:goodApp}}]});
  put("images/batch-manifest.json",{schema:"HIBOU_IMAGE_BATCH_V1",content_id:"recX",results:{
    "S01-C1":{status:"completed",prompt_application:goodApp,execution_receipt:goodReceipt,prompt_contract_execution_verified:true},
    "S01-C2":{status:"completed",prompt_application:goodApp,execution_receipt:goodReceipt,prompt_contract_execution_verified:true}
  }});
  put("images/selections.json",{S01:{selected:"candidate-1.png"}});
  put("images/image-perceptual-qc.json",{rows:[
    {scene_id:"S01",path:"candidate-1.png",status:"PASS",perceptual_score:91},
    {scene_id:"S01",path:"candidate-2.png",status:"PASS",perceptual_score:88}
  ]});
  put("images/generated-text-qc.json",{schema:"HIBOU_GENERATED_TEXT_BATCH_QC_V1",pass:true,candidate_count:2});
  put("creative-qc.json",{status:"PASS"});
  put("master-qc.json",{status:"PASS"});
  put("human-review.json",{human_approved:true,eligible_for_final_approval:true});
  put("semantic-review.json",{pass:true,reviewer:"editor",scenes:[{scene_id:"S01",status:"PASS"}]});
  put("master.mp4","video fixture");
  return {root,put};
}

test("PROMPT_CONTRACT_PASS needs current source, prompt preservation, montage, visual review and human approval",()=>{
  const {root,put}=fixture();
  try{
    assert.equal(evaluatePromptContractRun(root).PROMPT_CONTRACT_PASS,true);
    put("images/batch-manifest.json",{schema:"HIBOU_IMAGE_BATCH_V1",results:{
      "S01-C1":{status:"completed",prompt_application:goodApp,execution_receipt:{...goodReceipt,applied_prompt_sha256:"0".repeat(64)},prompt_contract_execution_verified:true}
    }});
    assert.equal(evaluatePromptContractRun(root).checks.comfy_prompt_execution_verified,false);
    put("images/batch-manifest.json",{schema:"HIBOU_IMAGE_BATCH_V1",results:{
      "S01-C1":{status:"completed",prompt_application:goodApp,execution_receipt:goodReceipt,prompt_contract_execution_verified:true},
      "S01-C2":{status:"completed",prompt_application:goodApp,execution_receipt:goodReceipt,prompt_contract_execution_verified:true}
    }});
    put("images/generated-text-qc.json",{schema:"HIBOU_GENERATED_TEXT_BATCH_QC_V1",pass:false,candidate_count:2});
    assert.equal(evaluatePromptContractRun(root).checks.generated_background_text_qc_pass,false);
    put("images/generated-text-qc.json",{schema:"HIBOU_GENERATED_TEXT_BATCH_QC_V1",pass:true,candidate_count:2});
    put("airtable-source-freshness.json",{pass:false});
    assert.equal(evaluatePromptContractRun(root).checks.airtable_source_verified,false);
    put("airtable-source-freshness.json",{pass:true});
    put("storyboard.json",{content:{source:"airtable"},production:{final_candidates_per_scene:2},
      creative:{production_defaults:{image_qc_threshold:85},pacing:{scene_duration_target_s:[2.8,5]}},
      scenes:[{scene_id:"S01",visual_idea:"four options converge to cash",image_prompt:"diagram with four options",planned_duration_s:9}]});
    assert.equal(evaluatePromptContractRun(root).checks.scene_timing_policy_verified,false);
    put("composition-timing-qc.json",{pass:true,scenes:[{scene_id:"S01",status:"PASS",
      visual_units:[{duration_s:4.5},{duration_s:4.5}]}]});
    assert.equal(evaluatePromptContractRun(root).checks.scene_timing_policy_verified,true);
    put("images/selections.json",{S01:{selected:"candidate-2.png"}});
    put("images/image-perceptual-qc.json",{rows:[
      {scene_id:"S01",path:"candidate-2.png",status:"PASS",perceptual_score:82}
    ]});
    assert.equal(evaluatePromptContractRun(root).checks.selected_images_meet_qc_threshold,false);
    put("images/selections.json",{S01:{selected:"candidate-1.png"}});
    put("images/image-perceptual-qc.json",{rows:[
      {scene_id:"S01",path:"candidate-1.png",status:"PASS",perceptual_score:91}
    ]});
    put("images/image-plan.json",{requests:[{scene_id:"S01",candidate_id:"S01-C1",request:{prompt_application:goodApp}}]});
    assert.equal(evaluatePromptContractRun(root).checks.candidate_coverage_complete,false);
    put("images/image-plan.json",{requests:[{
      request:{prompt_application:goodApp},
      fallback_request:{prompt_application:{...goodApp,preservation:{...goodApp.preservation,status:"REVIEW"}}}
    }]});
    assert.equal(evaluatePromptContractRun(root).checks.effective_image_prompts_preserved,false);
    put("images/image-plan.json",{requests:[{request:{prompt_application:{
      ...goodApp,visual_idea_component_included:false,
      preservation:{...goodApp.preservation,visual_idea_retention_ratio:0,status:"PASS"}
    }}}]});
    assert.equal(evaluatePromptContractRun(root).checks.effective_image_prompts_preserved,false);
    put("images/image-plan.json",{requests:[{request:{prompt_application:goodApp}}]});
    put("specific-action-montage-audit.json",{pass:false});
    assert.equal(evaluatePromptContractRun(root).checks.object_montage_actions_verified,false);
    put("specific-action-montage-audit.json",{pass:true});
    put("semantic-review.json",{pass:true,reviewer:"editor",scenes:[{scene_id:"S01",status:"REVIEW"}]});
    assert.equal(evaluatePromptContractRun(root).checks.semantic_scene_review_pass,false);
    put("semantic-review.json",{pass:true,reviewer:"editor",scenes:[{scene_id:"S01",status:"PASS"}]});
    put("human-review.json",{human_approved:false,eligible_for_final_approval:true});
    assert.equal(evaluatePromptContractRun(root).checks.human_approval_recorded,false);
  }finally{rmSync(root,{recursive:true,force:true});}
});

test("an incomplete run cannot inherit an old PASS_100_PERCENT as overall compliance",()=>{
  const {root,put}=fixture();
  try{
    put("prompt-contract-continuity.json",{pass:true,final_status:"PASS_100_PERCENT",coverage_pct:100});
    put("airtable-source-freshness.json",{pass:false});
    put("specific-action-montage-audit.json",{pass:false});
    put("human-review.json",{decision:"PENDING_HUMAN_REVIEW",human_approved:false});
    const result=evaluatePromptContractRun(root);
    assert.equal(result.PROMPT_CONTRACT_PASS,false);
    assert.deepEqual(result.failed.filter(x=>["airtable_source_verified","object_montage_actions_verified","human_approval_recorded"].includes(x)),[
      "airtable_source_verified","object_montage_actions_verified","human_approval_recorded"
    ]);
  }finally{rmSync(root,{recursive:true,force:true});}
});
