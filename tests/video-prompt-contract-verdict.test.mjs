import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluatePromptContractRun } from "../scripts/video-prompt-contract-verdict.mjs";
import { buildNegativePolicyCoverage } from "../scripts/video-negative-policy-coverage.mjs";

const negativePrompt="no humans, no generated brand name, no duplicated branding";
const negativeCoverage=buildNegativePolicyCoverage(negativePrompt);
const effectivePrompt="SCENE_IMAGE_PROMPT: diagram with four options\nBACKGROUND_POLICY: Unoccupied environment.\nSTRICT_GLYPH_FREE_LOCK: All surfaces blank.";

const goodApp={
  schema:"HIBOU_IMAGE_PROMPT_APPLICATION_V2",
  image_prompt_component_included:true,
  visual_idea_component_included:true,
  prompt_node_id:"6",prompt_input:"text",
  compiled_prompt_sha256:createHash("sha256").update(effectivePrompt).digest("hex"),
  negative_policy_source_sha256:negativeCoverage.source_sha256,
  negative_policy_categories:negativeCoverage.groups.map(group=>group.id),
  negative_policy_prompt_coverage:true,
  preservation:{status:"PASS",raw_image_prompt_chars:20,image_prompt_retention_ratio:0.6,
    raw_visual_idea_chars:20,visual_idea_retention_ratio:0.7}
};

function fixture(){
  const root=mkdtempSync(join(tmpdir(),"hibou-verdict-"));
  const put=(name,value)=>{
    const path=join(root,name);
    mkdirSync(join(path,".."),{recursive:true});
    writeFileSync(path,typeof value==="string"?value:JSON.stringify(value));
    return path;
  };
  put("storyboard.json",{content:{source:"airtable"},production:{final_candidates_per_scene:2},
    creative:{negative_prompt:negativePrompt,production_defaults:{image_qc_threshold:85},pacing:{scene_duration_target_s:[2.8,5]}},scenes:[{
    scene_id:"S01",visual_idea:"four options converge to cash",
    image_prompt:"diagram with four options",planned_duration_s:4
  }]});
  put("pipeline-run.json",{stages:Object.fromEntries(
    ["images","generated_text_qc","selected_background_text_qc","technical_selection","creative_qc","render","master_qc"].map(name=>[name,{status:"PASS"}])
  )});
  put("airtable-source-freshness.json",{pass:true,live_at_run:false});
  put("prompt-propagation.json",{pass:true});
  put("prompt-contract-continuity.json",{pass:true,coverage_pct:100});
  put("specific-action-montage-audit.json",{pass:true});
  put("images/image-plan.json",{creative_contract_enforced:true,negative_policy_coverage:negativeCoverage,requests:[{
    scene_id:"S01",candidate_id:"S01-C1",
    request:{prompt_application:goodApp,overrides:{"6":{text:effectivePrompt}}},
    fallback_request:{prompt_application:goodApp,overrides:{"6":{text:effectivePrompt}}}
  },{scene_id:"S01",candidate_id:"S01-C2",request:{prompt_application:goodApp,overrides:{"6":{text:effectivePrompt}}}}]});
  put("images/selections.json",{S01:{selected:"candidate-1.png"}});
  put("images/image-perceptual-qc.json",{rows:[
    {scene_id:"S01",path:"candidate-1.png",status:"PASS",perceptual_score:91},
    {scene_id:"S01",path:"candidate-2.png",status:"PASS",perceptual_score:88}
  ]});
  put("images/generated-text-qc.json",{schema:"HIBOU_GENERATED_TEXT_BATCH_QC_V1",pass:true,candidate_count:2});
  const background=put("selected-background.png","clean fixture image");
  put("selected-background-text-qc.json",{schema:"HIBOU_SELECTED_BACKGROUND_TEXT_QC_V1",pass:true,
    scene_count:1,rows:[{scene_id:"S01",path:background,status:"PASS",
      sha256:createHash("sha256").update("clean fixture image").digest("hex")}]});
  put("creative-qc.json",{status:"PASS"});
  put("master-qc.json",{status:"PASS"});
  put("human-review.json",{human_approved:true,eligible_for_final_approval:true,
    negative_policy_source_sha256:negativeCoverage.source_sha256,
    negative_policy_clause_count:negativeCoverage.clause_count,
    negative_policy_review_check_ids:negativeCoverage.groups.map(group=>group.human_review_check_id),
    checklist:negativeCoverage.groups.map(group=>({id:group.human_review_check_id,status:"PASS",human_pass:true,
      source_exclusions:group.clauses,negative_policy_source_sha256:negativeCoverage.source_sha256}))});
  put("semantic-review.json",{pass:true,reviewer:"editor",scenes:[{scene_id:"S01",status:"PASS"}]});
  put("master.mp4","video fixture");
  return {root,put};
}

test("PROMPT_CONTRACT_PASS needs current source, prompt preservation, montage, visual review and human approval",()=>{
  const {root,put}=fixture();
  try{
    assert.equal(evaluatePromptContractRun(root).PROMPT_CONTRACT_PASS,true);
    put("selected-background.png","changed after OCR");
    assert.equal(evaluatePromptContractRun(root).checks.rendered_background_text_qc_pass,false);
    put("selected-background.png","clean fixture image");
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

test("negative exclusions fail closed on source drift, missing routing and incomplete human decisions",()=>{
  const {root,put}=fixture();
  const get=name=>JSON.parse(readFileSync(join(root,name),"utf8"));
  try{
    const originalPlan=get("images/image-plan.json");
    const review=get("human-review.json");
    assert.equal(evaluatePromptContractRun(root).PROMPT_CONTRACT_PASS,true);
    put("human-review.json",{...review,checklist:review.checklist.slice(1)});
    assert.equal(evaluatePromptContractRun(root).checks.global_negative_policy_human_review_pass,false);
    assert.equal(evaluatePromptContractRun(root).PROMPT_CONTRACT_PASS,false);
    put("human-review.json",review);
    const pending=structuredClone(review);
    pending.checklist[0].human_pass=null;
    put("human-review.json",pending);
    assert.equal(evaluatePromptContractRun(root).checks.global_negative_policy_human_review_pass,false);
    put("human-review.json",review);
    const changedPlan=structuredClone(originalPlan);
    changedPlan.requests[0].fallback_request.overrides["6"].text="plain prompt without policy markers";
    changedPlan.requests[0].fallback_request.prompt_application.compiled_prompt_sha256=
      createHash("sha256").update("plain prompt without policy markers").digest("hex");
    put("images/image-plan.json",changedPlan);
    assert.equal(evaluatePromptContractRun(root).checks.global_negative_policy_prompt_routing_verified,false);
    put("images/image-plan.json",originalPlan);
    const storyboard=get("storyboard.json");
    storyboard.creative.negative_prompt+=", no camera shake";
    put("storyboard.json",storyboard);
    assert.equal(evaluatePromptContractRun(root).checks.global_negative_policy_coverage_verified,false);
  }finally{rmSync(root,{recursive:true,force:true});}
});
