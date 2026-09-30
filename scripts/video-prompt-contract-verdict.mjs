#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function readJson(path){
  if(!existsSync(path)) return null;
  try{ return JSON.parse(readFileSync(path,"utf8")); }catch{return null;}
}

function preserved(request){
  const app=request?.prompt_application;
  const p=app?.preservation;
  if(app?.schema!=="HIBOU_IMAGE_PROMPT_APPLICATION_V2") return false;
  if(p?.status!=="PASS") return false;
  if(typeof p.raw_image_prompt_chars!=="number"||
     typeof p.raw_visual_idea_chars!=="number"||
     !Number.isFinite(p.raw_image_prompt_chars)||
     !Number.isFinite(p.raw_visual_idea_chars)) return false;
  if(Number(p.raw_image_prompt_chars)>0&&(
    app.image_prompt_component_included!==true||
    Number(p.image_prompt_retention_ratio)<0.25
  )) return false;
  if(Number(p.raw_visual_idea_chars)>0&&(
    app.visual_idea_component_included!==true||
    Number(p.visual_idea_retention_ratio)<0.4
  )) return false;
  return true;
}

export function evaluatePromptContractRun(root){
  const file=name=>readJson(resolve(root,name));
  const storyboard=file("storyboard.json");
  const scenes=Array.isArray(storyboard?.scenes)?storyboard.scenes:[];
  const state=file("pipeline-run.json");
  const source=file("airtable-source-freshness.json");
  const propagation=file("prompt-propagation.json");
  const continuity=file("prompt-contract-continuity.json");
  const montage=file("specific-action-montage-audit.json")||file("planning/specific-action-montage-audit.json");
  const imagePlan=file("images/image-plan.json");
  const imageBatch=file("images/batch-manifest.json");
  const imageQc=file("images/image-perceptual-qc.json");
  const generatedTextQc=file("images/generated-text-qc.json");
  const selections=file("images/selections.json");
  const creative=file("creative-qc.json");
  const masterSemantic=file("master-semantic-qc.json");
  const masterQc=file("master-qc.json");
  const human=file("human-review.json");
  const semantic=file("semantic-review.json");
  const timing=file("composition-timing-qc.json");
  const requests=Array.isArray(imagePlan?.requests)?imagePlan.requests:[];
  const expectedCandidates=Math.max(1,Number(storyboard?.production?.final_candidates_per_scene||
    storyboard?.creative?.production_defaults?.candidates_per_scene||2));
  const imageThreshold=Number(storyboard?.creative?.production_defaults?.image_qc_threshold||85);
  const imageRows=Array.isArray(imageQc?.rows)?imageQc.rows:[];
  const completedExecutions=Object.values(imageBatch?.results||{}).filter(row=>row?.status==="completed");
  const stage=name=>state?.stages?.[name]?.status==="PASS";
  const byScene=new Map((semantic?.scenes||[]).map(row=>[String(row?.scene_id||""),row]));
  const timingByScene=new Map((timing?.scenes||[]).map(row=>[String(row?.scene_id||""),row]));
  const target=storyboard?.creative?.pacing?.scene_duration_target_s;
  const minTarget=Array.isArray(target)?Number(target[0]):0;
  const maxTarget=Array.isArray(target)?Number(target[1]):Number.POSITIVE_INFINITY;
  const checks={
    full_storyboard_scope:storyboard?.render_scope?.partial!==true,
    storyboard_complete:scenes.length>0&&scenes.every(scene=>
      Boolean(String(scene?.scene_id||"").trim())&&
      Boolean(String(scene?.visual_idea||"").trim())&&
      Boolean(String(scene?.image_prompt||"").trim())&&
      Number(scene?.planned_duration_s)>0
    ),
    scene_timing_policy_verified:scenes.length>0&&scenes.every(scene=>{
      const duration=Number(scene?.planned_duration_s);
      if(duration>=minTarget&&duration<=maxTarget) return true;
      const row=timingByScene.get(String(scene.scene_id));
      const units=Array.isArray(row?.visual_units)?row.visual_units:[];
      return timing?.pass===true&&row?.status==="PASS"&&units.length>0&&
        units.every(unit=>Number(unit.duration_s)>0&&Number(unit.duration_s)<=maxTarget)&&
        Math.abs(units.reduce((sum,unit)=>sum+Number(unit.duration_s),0)-duration)<0.1;
    }),
    airtable_source_verified:storyboard?.content?.source==="airtable"&&source?.pass===true,
    prompt_propagation_verified:propagation?.pass===true,
    contract_stage_coverage_verified:continuity?.pass===true&&Number(continuity?.coverage_pct)===100,
    object_montage_actions_verified:montage?.pass===true,
    effective_image_prompts_preserved:requests.length>0&&requests.every(item=>
      preserved(item?.request)&&(!item?.fallback_request||preserved(item.fallback_request))
    ),
    comfy_prompt_execution_verified:completedExecutions.length>0&&completedExecutions.every(row=>{
      const receipt=row?.execution_receipt;
      const app=row?.prompt_application;
      return row?.prompt_contract_execution_verified===true&&
        receipt?.schema==="HIBOU_COMFY_PROMPT_EXECUTION_V1"&&
        receipt?.prompt_verified===true&&
        Boolean(String(app?.compiled_prompt_sha256||""))&&
        receipt?.compiled_prompt_sha256===app.compiled_prompt_sha256&&
        receipt?.applied_prompt_sha256===app.compiled_prompt_sha256&&
        /^[a-f0-9]{64}$/i.test(String(receipt?.workflow_sha256||""));
    }),
    candidate_coverage_complete:scenes.length>0&&scenes.every(scene=>
      new Set(requests.filter(item=>item?.scene_id===scene.scene_id)
        .map(item=>String(item?.candidate_id||""))).size>=expectedCandidates
    ),
    image_generation_completed:stage("images")&&stage("technical_selection"),
    generated_background_text_qc_pass:stage("generated_text_qc")&&
      generatedTextQc?.schema==="HIBOU_GENERATED_TEXT_BATCH_QC_V1"&&
      generatedTextQc?.pass===true&&Number(generatedTextQc?.candidate_count)>0,
    selected_images_meet_qc_threshold:scenes.length>0&&scenes.every(scene=>{
      const selected=String(selections?.[scene.scene_id]?.selected||"");
      const row=imageRows.find(item=>item?.scene_id===scene.scene_id&&item?.path===selected);
      return Boolean(selected)&&row?.status==="PASS"&&Number(row?.perceptual_score)>=imageThreshold;
    }),
    creative_qc_pass:stage("creative_qc")&&creative?.status==="PASS",
    post_render_semantic_qc_pass:stage("creative_qc")
      ? stage("master_semantic_qc")&&masterSemantic?.status==="PASS"
      : true,
    render_completed:stage("render")&&existsSync(resolve(root,"master.mp4")),
    master_qc_pass:stage("master_qc")&&masterQc?.status==="PASS",
    semantic_scene_review_pass:semantic?.pass===true&&
      Boolean(String(semantic?.reviewer||"").trim())&&
      scenes.length>0&&scenes.every(scene=>byScene.get(String(scene.scene_id))?.status==="PASS"),
    human_approval_recorded:human?.human_approved===true&&human?.eligible_for_final_approval===true
  };
  const failed=Object.entries(checks).filter(([,ok])=>!ok).map(([name])=>name);
  return {
    schema:"HIBOU_PROMPT_CONTRACT_VERDICT_V1",
    PROMPT_CONTRACT_PASS:failed.length===0,
    checks,
    failed,
    scene_count:scenes.length,
    source_live_at_run:source?.live_at_run===true,
    master:existsSync(resolve(root,"master.mp4"))?resolve(root,"master.mp4"):null,
    publication_authorized:false
  };
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const root=resolve(process.argv[2]||"");
  const output=resolve(process.argv[3]||resolve(root,"prompt-contract-verdict.json"));
  const result=evaluatePromptContractRun(root);
  writeFileSync(output,JSON.stringify(result,null,2)+"\n","utf8");
  process.stdout.write(JSON.stringify({PROMPT_CONTRACT_PASS:result.PROMPT_CONTRACT_PASS,failed:result.failed,output})+"\n");
  if(!result.PROMPT_CONTRACT_PASS) process.exitCode=2;
}
