#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { buildImagePlan } from "./video-image-plan.mjs";
import { executeImagePlan } from "./video-image-batch.mjs";
import { qcImageBatch } from "./video-image-qc.mjs";
import { buildTargetedRegeneration } from "./video-image-regenerate.mjs";
import { buildCandidateDecisionTemplate, buildCandidateReview, renderCandidateReviewHtml } from "./video-candidate-review.mjs";

function fail(m){throw new Error(m);}
const SCRIPT_DIR=dirname(fileURLToPath(import.meta.url));

function runChecked(command,args,label){
  const r=spawnSync(command,args,{
    encoding:"utf8",
    windowsHide:true,
    shell:false,
    maxBuffer:32*1024*1024
  });
  if(r.status!==0){
    const detail=String(r.stderr||r.stdout||"").slice(-5000);
    fail(label+" failed with status "+r.status+(detail?"\n"+detail:""));
  }
  return r;
}

function qcPython(){
  const explicit=String(process.env.HIBOU_QC_PYTHON||"").trim();
  if(explicit){
    runChecked(explicit,["-c","import cv2, numpy"],"HIBOU_QC_PYTHON dependency probe");
    return explicit;
  }

  const base=String(process.env.HIBOU_PYTHON||"python").trim();
  if(process.platform!=="win32"){
    runChecked(base,["-c","import cv2, numpy"],"QC dependency probe");
    return base;
  }

  const localAppData=String(process.env.LOCALAPPDATA||"").trim();
  if(!localAppData) fail("LOCALAPPDATA missing; cannot create isolated Hibou QC venv");

  const qcRoot=resolve(localAppData,"LeHibou","video","qc","venv");
  const python=resolve(qcRoot,"Scripts","python.exe");

  if(!existsSync(python)){
    mkdirSync(dirname(qcRoot),{recursive:true});
    runChecked(base,["-m","venv",qcRoot],"Create isolated Hibou QC venv");
  }

  let probe=spawnSync(python,["-c","import cv2, numpy"],{
    encoding:"utf8",
    windowsHide:true,
    shell:false,
    maxBuffer:16*1024*1024
  });

  if(probe.status!==0){
    runChecked(
      python,
      [
        "-m","pip","install",
        "--disable-pip-version-check",
        "--no-input",
        "--upgrade",
        "numpy<2",
        "opencv-python-headless==4.10.0.84"
      ],
      "Install isolated Hibou QC dependencies"
    );
    probe=spawnSync(python,["-c","import cv2, numpy"],{
      encoding:"utf8",
      windowsHide:true,
      shell:false,
      maxBuffer:16*1024*1024
    });
  }

  if(probe.status!==0){
    const detail=String(probe.stderr||probe.stdout||"").slice(-5000);
    fail("Hibou QC dependency probe failed after repair"+(detail?"\n"+detail:""));
  }

  return python;
}
function load(p){return JSON.parse(readFileSync(resolve(p),"utf8"));}
function write(p,v){writeFileSync(resolve(p),JSON.stringify(v,null,2)+"\n");}
function arg(name,fallback=""){
  const hit=process.argv.find(x=>x.startsWith("--"+name+"="));
  return hit?hit.slice(name.length+3):fallback;
}
function runPerceptual(techPath,outPath,reference=""){
  const python=qcPython();
  const args=[resolve(SCRIPT_DIR,"video-image-perceptual-qc.py"),resolve(techPath),resolve(outPath)];
  if(reference) args.push(resolve(reference));
  const r=spawnSync(python,args,{encoding:"utf8",windowsHide:true,shell:false,maxBuffer:16*1024*1024});
  if(r.status!==0) fail("perceptual QC failed: "+String(r.stderr||r.stdout||"").slice(-3000));
  return load(outPath);
}

function envFlag(name){
  return String(process.env[name]||"").trim().toLowerCase()==="true";
}
function creativePython(){
  const python=String(process.env.HIBOU_PYTHON||"").trim();
  if(!python){
    fail("HIBOU_PYTHON missing for candidate Creative QC; run video:doctor:windows");
  }
  runChecked(
    python,
    ["-c","import torch, transformers, PIL; from transformers import CLIPModel, CLIPProcessor"],
    "Creative QC dependency probe"
  );
  return python;
}
function candidateCreativeEnabled(storyboard){
  return storyboard?.features?.video_creative_qc_v1===true&&envFlag("HIBOU_VIDEO_CREATIVE_QC_V1");
}
function cumulativeBrief(scene){
  return [String(scene?.image_prompt||"").trim(),String(scene?.visual_idea||"").trim()]
    .filter(Boolean).join("\n");
}
function candidateCreativeManifest(storyboard,plan,perceptual){
  const sceneMap=new Map((storyboard?.scenes||[]).map(scene=>[String(scene?.scene_id||""),scene]));
  const scenes=(perceptual?.rows||[])
    .filter(row=>row?.status==="PASS"&&row?.candidate_id&&row?.path)
    .map(row=>{
      const scene=sceneMap.get(String(row.scene_id||""))||{};
      return {
        scene_id:String(row.scene_id||""),
        candidate_id:String(row.candidate_id||""),
        image:String(row.path||""),
        brief:cumulativeBrief(scene),
        style_prompt:String(storyboard?.creative?.style_lock||""),
        expected_hibou:false,
        hibou_composited_later:Boolean(scene?.framing?.hibou),
        allow_postproduction_text:false
      };
    });
  return {
    schema:"HIBOU_CANDIDATE_CREATIVE_QC_INPUT_V1",
    prompt_contract_ref:structuredClone(plan?.prompt_contract_ref||null),
    thresholds:storyboard?.creative?.creative_qc?.thresholds||{},
    canonical_hibou:null,
    scenes
  };
}
export function applyCandidateCreativeQc(perceptual,creativeReport){
  const out=structuredClone(perceptual||{});
  const creativeByCandidate=new Map(
    (creativeReport?.scenes||[]).map(row=>[String(row?.candidate_id||""),row])
  );
  for(const row of out.rows||[]){
    if(row?.status!=="PASS") continue;
    const creative=creativeByCandidate.get(String(row?.candidate_id||""));
    row.creative_qc=creative?structuredClone(creative):null;
    row.creative_semantic_score=Number.isFinite(Number(creative?.scores?.semantic_brief))
      ?Number(creative.scores.semantic_brief)
      :null;
    if(!creative||creative.pass!==true){
      row.status="REJECT";
      row.reasons=[...new Set([...(row.reasons||[]),"creative_semantic_reject"])];
    }
  }
  const grouped={};
  for(const row of out.rows||[]){
    (grouped[row.scene_id]??=[]).push(row);
  }
  const sceneSummary={};
  for(const [sceneId,items] of Object.entries(grouped)){
    const passes=items.filter(row=>row.status==="PASS").sort((a,b)=>{
      const aSemantic=Number.isFinite(Number(a.creative_semantic_score))?Number(a.creative_semantic_score):-1;
      const bSemantic=Number.isFinite(Number(b.creative_semantic_score))?Number(b.creative_semantic_score):-1;
      if(aSemantic!==bSemantic) return bSemantic-aSemantic;
      const aPerceptual=Number.isFinite(Number(a.perceptual_score))?Number(a.perceptual_score):-1;
      const bPerceptual=Number.isFinite(Number(b.perceptual_score))?Number(b.perceptual_score):-1;
      if(aPerceptual!==bPerceptual) return bPerceptual-aPerceptual;
      return Number(a.candidate||999)-Number(b.candidate||999);
    });
    const reasonCounts={};
    const warningCounts={};
    for(const item of items){
      for(const reason of item.reasons||[]) reasonCounts[reason]=(reasonCounts[reason]||0)+1;
      for(const warning of item.warnings||[]) warningCounts[warning]=(warningCounts[warning]||0)+1;
    }
    sceneSummary[sceneId]={
      pass:passes.length,
      reject:items.length-passes.length,
      total:items.length,
      selected_candidate_id:passes[0]?.candidate_id||null,
      selected_score:passes[0]?.perceptual_score??null,
      selected_creative_semantic_score:passes[0]?.creative_semantic_score??null,
      needs_regeneration:passes.length===0,
      reason_counts:reasonCounts,
      warning_counts:warningCounts
    };
  }
  out.scene_summary=sceneSummary;
  out.all_scenes_have_candidate=
    Object.keys(sceneSummary).length>0&&Object.values(sceneSummary).every(summary=>!summary.needs_regeneration);
  out.candidate_creative_qc={
    schema:"HIBOU_CANDIDATE_CREATIVE_QC_APPLICATION_V1",
    applied:true,
    candidate_count:(creativeReport?.scenes||[]).length,
    rejected_candidate_count:(creativeReport?.scenes||[]).filter(row=>row?.pass!==true).length
  };
  return out;
}
function runCandidateCreative(storyboard,plan,perceptual,root){
  const input=candidateCreativeManifest(storyboard,plan,perceptual);
  if(!input.scenes.length){
    return {report:{schema:"HIBOU_CREATIVE_QC_V1",status:"REJECT",scenes:[]},perceptual};
  }
  const inputPath=resolve(root,"candidate-creative-qc-input.json");
  const reportPath=resolve(root,"candidate-creative-qc.json");
  write(inputPath,input);
  const python=creativePython();
  const args=[resolve(SCRIPT_DIR,"video-creative-qc.py"),inputPath,"--output",reportPath];
  const model=String(storyboard?.creative?.creative_qc?.model||"").trim();
  if(model) args.push("--model",model);
  const r=spawnSync(python,args,{encoding:"utf8",windowsHide:true,shell:false,maxBuffer:32*1024*1024});
  if(r.status!==0) fail("candidate Creative QC failed: "+String(r.stderr||r.stdout||"").slice(-5000));
  const report=load(reportPath);
  return {report,perceptual:applyCandidateCreativeQc(perceptual,report)};
}
function provisionalSelections(qc,manifest){
  const rows=qc.rows||[];
  const out={};
  for(const [sceneId,summary] of Object.entries(qc.scene_summary||{})){
    const selected=summary.selected_candidate_id;
    const row=rows.find(x=>x.scene_id===sceneId&&x.candidate_id===selected);
    out[sceneId]={
      selected_candidate_id:selected||null,
      selected_path:row?.path||null,
      status:selected?"PROVISIONAL_QC_PASS":"NO_PASS",
      human_review_required:true
    };
  }
  return out;
}

function aggregatePerceptual(perceptual){
  const reasons={};
  const warnings={};
  for(const summary of Object.values(perceptual?.scene_summary||{})){
    for(const [name,count] of Object.entries(summary?.reason_counts||{})){
      reasons[name]=(reasons[name]||0)+Number(count||0);
    }
    for(const [name,count] of Object.entries(summary?.warning_counts||{})){
      warnings[name]=(warnings[name]||0)+Number(count||0);
    }
  }
  return {
    all_scenes_have_candidate:Boolean(perceptual?.all_scenes_have_candidate),
    reason_counts:reasons,
    warning_counts:warnings
  };
}

function aggregateDimensions(tech){
  const counts={};
  for(const row of tech?.rows||[]){
    const key=`${row.width||"?"}x${row.height||"?"}`;
    counts[key]=(counts[key]||0)+1;
  }
  return counts;
}

function qcOptionsFromPlan(plan){
  const profiles=[plan?.profile,plan?.fallback_profile].filter(Boolean);
  const widths=profiles.map(p=>Number(p.width)).filter(Number.isFinite);
  const heights=profiles.map(p=>Number(p.height)).filter(Number.isFinite);
  return {
    minWidth:Math.max(512,Math.min(...widths)),
    minHeight:Math.max(896,Math.min(...heights)),
    aspectTolerance:0.05
  };
}
export function factoryPolicy({maxScenes=1,maxRegenerationAttempts=1}={}){
  const scenes=Number(maxScenes), attempts=Number(maxRegenerationAttempts);
  if(!Number.isInteger(scenes)||scenes<1||scenes>20) fail("maxScenes must be 1..20");
  if(!Number.isInteger(attempts)||attempts<0||attempts>2) fail("maxRegenerationAttempts must be 0..2");
  return {max_scenes:scenes,max_regeneration_attempts:attempts,paid_fallback:false,human_review_required:true};
}

export function summarizeGenerationRuns(runs,{sceneCount=0}={}){
  const rows=Array.isArray(runs)?runs:[];
  const generated=rows.reduce((sum,row)=>sum+Number(row?.generated_candidate_count||0),0);
  const candidateElapsedMs=rows.reduce(
    (sum,row)=>sum+Number(row?.timing?.generated_candidate_elapsed_ms||0),
    0
  );
  const batchElapsedMs=rows.reduce(
    (sum,row)=>sum+Number(row?.timing?.elapsed_ms||0),
    0
  );
  const cacheHits=rows.reduce((sum,row)=>sum+Number(row?.cache_hits||0),0);
  const meanMs=generated?candidateElapsedMs/generated:null;
  const estimate=(count)=>meanMs==null?null:Math.round((meanMs*Math.max(0,Number(sceneCount)||0)*count)/100)/10;
  return {
    schema:"HIBOU_IMAGE_GENERATION_THROUGHPUT_V1",
    run_count:rows.length,
    scene_count:Number(sceneCount)||0,
    generated_candidate_count:generated,
    cache_hits:cacheHits,
    generated_candidate_elapsed_ms:candidateElapsedMs,
    batch_elapsed_ms:batchElapsedMs,
    mean_generated_candidate_elapsed_ms:meanMs,
    estimated_generation_seconds:{
      one_candidate_per_scene:estimate(1),
      two_candidates_per_scene:estimate(2),
      three_candidates_per_scene:estimate(3)
    },
    estimate_basis:"observed generated candidates in this factory execution; excludes cache hits",
    publication_authorized:false
  };
}
async function main(){
  const factoryStartedMs=Date.now();
  const [storyboardArg,bindingArg,outArg]=process.argv.slice(2).filter(x=>!x.startsWith("--"));
  if(!storyboardArg||!bindingArg||!outArg) fail("usage: video-image-factory.mjs storyboard.json binding.json output_dir [--max-scenes=1] [--regen-attempts=1] [--reference=path]");
  const policy=factoryPolicy({
    maxScenes:Number(arg("max-scenes","1")),
    maxRegenerationAttempts:Number(arg("regen-attempts","1"))
  });
  const root=resolve(outArg); mkdirSync(root,{recursive:true});
  const storyboard=load(storyboardArg), binding=load(bindingArg);
  const originalPlan=buildImagePlan(storyboard,binding);
  const limitedScenes=[];
  for(const req of originalPlan.requests){
    if(!limitedScenes.includes(req.scene_id)&&limitedScenes.length<policy.max_scenes) limitedScenes.push(req.scene_id);
  }
  const plan={...originalPlan,requests:originalPlan.requests.filter(x=>limitedScenes.includes(x.scene_id))};
  plan.scene_count=limitedScenes.length; plan.request_count=plan.requests.length;
  const planPath=resolve(root,"image-plan.json");
  const manifestPath=resolve(root,"batch-manifest.json");
  const selectionTemplate=resolve(root,"selections.template.json");
  const techPath=resolve(root,"image-tech-qc.json");
  const perceptualPath=resolve(root,"image-perceptual-qc.json");
  write(planPath,plan);

  if(plan.requests.length===0){
    const emptyManifest={schema:"HIBOU_IMAGE_BATCH_V1",content_id:plan.content_id,results:{},updated_at:new Date().toISOString(),scene_count_processed:0,cache_hits:0,generated_this_run:0,paid_fallback:false};
    write(manifestPath,emptyManifest);
    write(selectionTemplate,{});
    write(resolve(root,"selections.provisional.json"),{});
    const emptyCandidateReview={
      schema:"HIBOU_CANDIDATE_REVIEW_V1",
      content_id:plan.content_id||null,
      prompt_contract_ref:structuredClone(plan.prompt_contract_ref||null),
      scene_count:0,
      blocking_scene_count:0,
      all_scenes_reviewable:true,
      scenes:[],
      generation_skipped_reason:"all_scenes_full_reuse",
      policy:{
        machine_ranking_is_advisory_only:true,
        human_selection_required:false,
        no_candidate_is_auto_approved:true,
        local_only:true,
        paid_fallback:false,
        publication_authorized:false
      },
      human_review_required:true,
      publication_authorized:false
    };
    write(resolve(root,"candidate-review.json"),emptyCandidateReview);
    write(resolve(root,"candidate-decisions.template.json"),buildCandidateDecisionTemplate(emptyCandidateReview));
    writeFileSync(resolve(root,"candidate-review.html"),renderCandidateReviewHtml(emptyCandidateReview),"utf8");
    const factoryFinishedMs=Date.now();
    const summary={
      schema:"HIBOU_IMAGE_FACTORY_RUN_V1",
      generated_at:new Date(factoryFinishedMs).toISOString(),
      content_id:plan.content_id,
      scenes:[],
      reused_scenes:plan.skipped_full_reuse||[],
      policy,
      regeneration_runs:[],
      all_scenes_have_candidate:true,
      provisional_selections:{},
      generation_skipped_reason:"all_scenes_full_reuse",
      timing:{
        factory_started_at:new Date(factoryStartedMs).toISOString(),
        factory_finished_at:new Date(factoryFinishedMs).toISOString(),
        factory_elapsed_ms:Math.max(0,factoryFinishedMs-factoryStartedMs),
        generation:summarizeGenerationRuns([],{sceneCount:0})
      },
      publication_authorized:false
    };
    write(resolve(root,"factory-run.json"),summary);
    process.stdout.write(JSON.stringify({ok:true,...summary})+"\n");
    return;
  }

  const initialBatch=await executeImagePlan(plan,{manifestPath,selectionTemplatePath:selectionTemplate,maxScenes:policy.max_scenes});
  const generationRuns=[{
    phase:"initial",
    generated_candidate_count:initialBatch.generated_this_run,
    cache_hits:initialBatch.cache_hits,
    cache_invalidations:initialBatch.cache_invalidations,
    timing:initialBatch.timing
  }];
  let manifest=load(manifestPath);
  const qcOptions=qcOptionsFromPlan(plan);
  let tech=qcImageBatch(manifest,qcOptions); write(techPath,tech);
  let perceptual=runPerceptual(techPath,perceptualPath,arg("reference",""));
  const semanticCandidatesEnabled=candidateCreativeEnabled(storyboard);
  let candidateCreativeReport=null;
  if(semanticCandidatesEnabled){
    const creativeRun=runCandidateCreative(storyboard,plan,perceptual,root);
    candidateCreativeReport=creativeRun.report;
    perceptual=creativeRun.perceptual;
    write(perceptualPath,perceptual);
  }
  const reviewRequests=[...(plan.requests||[])];

  const regenRuns=[];
  for(let attempt=1;attempt<=policy.max_regeneration_attempts&&!perceptual.all_scenes_have_candidate;attempt++){
    const regen=buildTargetedRegeneration(plan,perceptual,{attempt});
    if(!regen.requests.length) break;
    const regenPath=resolve(root,"regen-plan-"+attempt+".json"); write(regenPath,regen);
    reviewRequests.push(...(regen.requests||[]));
    const regenBatch=await executeImagePlan(regen,{manifestPath,selectionTemplatePath:selectionTemplate,maxScenes:policy.max_scenes});
    generationRuns.push({
      phase:"regeneration",
      attempt,
      generated_candidate_count:regenBatch.generated_this_run,
      cache_hits:regenBatch.cache_hits,
      cache_invalidations:regenBatch.cache_invalidations,
      timing:regenBatch.timing
    });
    manifest=load(manifestPath);
    tech=qcImageBatch(manifest,qcOptions); write(techPath,tech);
    perceptual=runPerceptual(techPath,perceptualPath,arg("reference",""));
    if(semanticCandidatesEnabled){
      const creativeRun=runCandidateCreative(storyboard,{...plan,requests:reviewRequests},perceptual,root);
      candidateCreativeReport=creativeRun.report;
      perceptual=creativeRun.perceptual;
      write(perceptualPath,perceptual);
    }
    regenRuns.push({attempt,failed_scenes:regen.regeneration.failed_scenes,requests:regen.requests.length});
  }

  const selections=provisionalSelections(perceptual,manifest);
  write(resolve(root,"selections.provisional.json"),selections);
  const reviewPlan={...plan,requests:reviewRequests,request_count:reviewRequests.length};
  const candidateReview=buildCandidateReview({
    plan:reviewPlan,
    perceptualQc:perceptual,
    provisionalSelections:selections
  });
  write(resolve(root,"candidate-review.json"),candidateReview);
  write(resolve(root,"candidate-decisions.template.json"),buildCandidateDecisionTemplate(candidateReview));
  writeFileSync(resolve(root,"candidate-review.html"),renderCandidateReviewHtml(candidateReview),"utf8");
  const factoryFinishedMs=Date.now();
  const generationThroughput=summarizeGenerationRuns(
    generationRuns,
    {sceneCount:limitedScenes.length}
  );
  const summary={
    schema:"HIBOU_IMAGE_FACTORY_RUN_V1",
    generated_at:new Date(factoryFinishedMs).toISOString(),
    content_id:plan.content_id,
    scenes:limitedScenes,
    policy,
    image_profile:{
      primary:plan.profile||null,
      fallback:plan.fallback_profile||null,
      size_binding:plan.size_binding||null,
      size_binding_repaired:Boolean(plan.size_binding_repaired),
      qc_options:qcOptions
    },
    regeneration_runs:regenRuns,
    all_scenes_have_candidate:perceptual.all_scenes_have_candidate,
    technical_qc:{
      all_scenes_have_candidate:Boolean(tech?.all_scenes_have_candidate),
      failed_check_counts:tech?.failed_check_counts||{},
      dimensions:aggregateDimensions(tech),
      min_width:tech?.min_width??null,
      min_height:tech?.min_height??null,
      aspect_tolerance:tech?.aspect_tolerance??null,
      qc_options:qcOptions
    },
    perceptual_qc:aggregatePerceptual(perceptual),
    candidate_creative_qc:{
      enabled:semanticCandidatesEnabled,
      status:candidateCreativeReport?.status||"DISABLED",
      candidate_count:(candidateCreativeReport?.scenes||[]).length,
      semantic_filter_applied:Boolean(perceptual?.candidate_creative_qc?.applied),
      rejected_candidate_count:Number(perceptual?.candidate_creative_qc?.rejected_candidate_count||0)
    },
    provisional_selections:selections,
    candidate_review:{
      schema:candidateReview.schema,
      scene_count:candidateReview.scene_count,
      blocking_scene_count:candidateReview.blocking_scene_count,
      all_scenes_reviewable:candidateReview.all_scenes_reviewable,
      human_review_required:true,
      publication_authorized:false
    },
    timing:{
      factory_started_at:new Date(factoryStartedMs).toISOString(),
      factory_finished_at:new Date(factoryFinishedMs).toISOString(),
      factory_elapsed_ms:Math.max(0,factoryFinishedMs-factoryStartedMs),
      generation_runs:generationRuns,
      generation:generationThroughput
    },
    publication_authorized:false
  };
  write(resolve(root,"factory-run.json"),summary);
  process.stdout.write(JSON.stringify({ok:true,...summary})+"\n");
  if(!summary.all_scenes_have_candidate) process.exitCode=2;
}
if(import.meta.url===pathToFileURL(resolve(process.argv[1])).href) main().catch(e=>{console.error(String(e?.stack||e));process.exitCode=1;});
