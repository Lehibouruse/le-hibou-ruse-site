#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { buildImagePlan } from "./video-image-plan.mjs";
import { executeImagePlan } from "./video-image-batch.mjs";
import { qcImageBatch } from "./video-image-qc.mjs";
import { buildTargetedRegeneration } from "./video-image-regenerate.mjs";

function fail(m){throw new Error(m);}
function load(p){return JSON.parse(readFileSync(resolve(p),"utf8"));}
function write(p,v){writeFileSync(resolve(p),JSON.stringify(v,null,2)+"\n");}
function arg(name,fallback=""){
  const hit=process.argv.find(x=>x.startsWith("--"+name+"="));
  return hit?hit.slice(name.length+3):fallback;
}
function runPerceptual(techPath,outPath,reference=""){
  const python=String(process.env.HIBOU_QC_PYTHON||process.env.HIBOU_PYTHON||"python").trim();
  const args=[resolve("scripts/video-image-perceptual-qc.py"),resolve(techPath),resolve(outPath)];
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

  await executeImagePlan(plan,{manifestPath,selectionTemplatePath:selectionTemplate,maxScenes:policy.max_scenes});
  let manifest=load(manifestPath);
  let tech=qcImageBatch(manifest); write(techPath,tech);
  let perceptual=runPerceptual(techPath,perceptualPath,arg("reference",""));

  const regenRuns=[];
  for(let attempt=1;attempt<=policy.max_regeneration_attempts&&!perceptual.all_scenes_have_candidate;attempt++){
    const regen=buildTargetedRegeneration(plan,perceptual,{attempt});
    if(!regen.requests.length) break;
    const regenPath=resolve(root,"regen-plan-"+attempt+".json"); write(regenPath,regen);
    await executeImagePlan(regen,{manifestPath,selectionTemplatePath:selectionTemplate,maxScenes:policy.max_scenes});
    manifest=load(manifestPath);
    tech=qcImageBatch(manifest); write(techPath,tech);
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
    regeneration_runs:regenRuns,
    all_scenes_have_candidate:perceptual.all_scenes_have_candidate,
    provisional_selections:selections,
    publication_authorized:false
  };
  write(resolve(root,"factory-run.json"),summary);
  process.stdout.write(JSON.stringify({ok:true,...summary})+"\n");
  if(!summary.all_scenes_have_candidate) process.exitCode=2;
}
if(import.meta.url===`file://${process.argv[1]}`) main().catch(e=>{console.error(String(e?.stack||e));process.exitCode=1;});
