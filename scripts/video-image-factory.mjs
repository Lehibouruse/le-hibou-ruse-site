#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { buildImagePlan } from "./video-image-plan.mjs";
import { executeImagePlan } from "./video-image-batch.mjs";
import { qcImageBatch } from "./video-image-qc.mjs";
import { buildTargetedRegeneration } from "./video-image-regenerate.mjs";

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

function summarizeTechnicalQc(tech){
  const failure_counts={};
  const dimensions={};
  for(const row of tech?.rows||[]){
    const key=`${row.width||"?"}x${row.height||"?"}`;
    dimensions[key]=(dimensions[key]||0)+1;
    for(const [check,ok] of Object.entries(row.checks||{})){
      if(!ok) failure_counts[check]=(failure_counts[check]||0)+1;
    }
    if(row.error) failure_counts.decode_error=(failure_counts.decode_error||0)+1;
  }
  return {
    all_scenes_have_candidate:Boolean(tech?.all_scenes_have_candidate),
    failure_counts,
    dimensions,
    scene_summary:tech?.scene_summary||{}
  };
}

function summarizePerceptualQc(perceptual){
  const reason_counts={};
  const warning_counts={};
  for(const row of perceptual?.rows||[]){
    for(const reason of row.reasons||[]) reason_counts[reason]=(reason_counts[reason]||0)+1;
    for(const warning of row.warnings||[]) warning_counts[warning]=(warning_counts[warning]||0)+1;
  }
  return {
    all_scenes_have_candidate:Boolean(perceptual?.all_scenes_have_candidate),
    reason_counts,
    warning_counts,
    scene_summary:perceptual?.scene_summary||{}
  };
}
export function factoryPolicy({maxScenes=1,maxRegenerationAttempts=1}={}){
  const scenes=Number(maxScenes), attempts=Number(maxRegenerationAttempts);
  if(!Number.isInteger(scenes)||scenes<1||scenes>20) fail("maxScenes must be 1..20");
  if(!Number.isInteger(attempts)||attempts<0||attempts>2) fail("maxRegenerationAttempts must be 0..2");
  return {max_scenes:scenes,max_regeneration_attempts:attempts,paid_fallback:false,human_review_required:true};
}
async function main(){
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
    const summary={
      schema:"HIBOU_IMAGE_FACTORY_RUN_V1",
      generated_at:new Date().toISOString(),
      content_id:plan.content_id,
      scenes:[],
      reused_scenes:plan.skipped_full_reuse||[],
      policy,
      regeneration_runs:[],
      all_scenes_have_candidate:true,
      provisional_selections:{},
      generation_skipped_reason:"all_scenes_full_reuse",
      publication_authorized:false
    };
    write(resolve(root,"factory-run.json"),summary);
    process.stdout.write(JSON.stringify({ok:true,...summary})+"\n");
    return;
  }

  await executeImagePlan(plan,{manifestPath,selectionTemplatePath:selectionTemplate,maxScenes:policy.max_scenes});
  let manifest=load(manifestPath);
  const qcOptions=qcOptionsFromPlan(plan);
  let tech=qcImageBatch(manifest,qcOptions); write(techPath,tech);
  let perceptual=runPerceptual(techPath,perceptualPath,arg("reference",""));

  const regenRuns=[];
  for(let attempt=1;attempt<=policy.max_regeneration_attempts&&!perceptual.all_scenes_have_candidate;attempt++){
    const regen=buildTargetedRegeneration(plan,perceptual,{attempt});
    if(!regen.requests.length) break;
    const regenPath=resolve(root,"regen-plan-"+attempt+".json"); write(regenPath,regen);
    await executeImagePlan(regen,{manifestPath,selectionTemplatePath:selectionTemplate,maxScenes:policy.max_scenes});
    manifest=load(manifestPath);
    tech=qcImageBatch(manifest,qcOptions); write(techPath,tech);
    perceptual=runPerceptual(techPath,perceptualPath,arg("reference",""));
    regenRuns.push({attempt,failed_scenes:regen.regeneration.failed_scenes,requests:regen.requests.length});
  }

  const selections=provisionalSelections(perceptual,manifest);
  write(resolve(root,"selections.provisional.json"),selections);
  const summary={
    schema:"HIBOU_IMAGE_FACTORY_RUN_V1",
    generated_at:new Date().toISOString(),
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
    technical_qc:summarizeTechnicalQc(tech),
    perceptual_qc:summarizePerceptualQc(perceptual),
    all_scenes_have_candidate:perceptual.all_scenes_have_candidate,
    provisional_selections:selections,
    publication_authorized:false
  };
  write(resolve(root,"factory-run.json"),summary);
  process.stdout.write(JSON.stringify({ok:true,...summary})+"\n");
  if(!summary.all_scenes_have_candidate) process.exitCode=2;
}
if(import.meta.url===pathToFileURL(resolve(process.argv[1])).href) main().catch(e=>{console.error(String(e?.stack||e));process.exitCode=1;});
