#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { runImageGen } from "./video-local-adapters.mjs";

function fail(message){throw new Error(message);}
export function isCudaOom(error){
  const message=String(error?.message||error||"");
  return /(?:cuda[^\n]{0,80})?out of memory|cuda error[^\n]{0,80}memory|cublas_status_alloc_failed|torch\.outofmemoryerror/i.test(message);
}
function stable(value){
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==="object"){
    return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));
  }
  return value;
}
export function imageRequestFingerprint(item){
  return createHash("sha256")
    .update(JSON.stringify(stable({
      request:item?.request||null,
      fallback_request:item?.fallback_request||null
    })))
    .digest("hex");
}
function loadExisting(path,contentId){
  if(!path||!existsSync(path)) return {schema:"HIBOU_IMAGE_BATCH_V1",content_id:contentId,results:{}};
  try{
    const parsed=JSON.parse(readFileSync(path,"utf8"));
    if(parsed.schema!=="HIBOU_IMAGE_BATCH_V1"||parsed.content_id!==contentId) fail("existing image batch manifest does not match plan");
    parsed.results ||= {};
    return parsed;
  }catch(error){fail(`cannot reuse image batch manifest: ${error.message}`);}
}
function outputsStillExist(result,requestFingerprint){
  return result?.status==="completed"
    && result?.request_fingerprint===requestFingerprint
    && Array.isArray(result.outputs)
    && result.outputs.length>0
    && result.outputs.every(o=>existsSync(o.path));
}
function writeState(path,state){
  if(!path) return;
  mkdirSync(dirname(resolve(path)),{recursive:true});
  writeFileSync(resolve(path),JSON.stringify(state,null,2));
}
export async function executeImagePlan(plan,{runner=runImageGen,manifestPath="",selectionTemplatePath="",maxScenes=Infinity,now=()=>Date.now()}={}){
  if(plan?.schema!=="HIBOU_IMAGE_PLAN_V1") fail("unsupported image plan");
  if(!Array.isArray(plan.requests)||!plan.requests.length) fail("image plan has no requests");
  const state=loadExisting(manifestPath,plan.content_id);
  const runStartedMs=Number(now());
  const generatedCandidateDurations=[];
  const requestedKeys=new Set(plan.requests.map(item=>item.candidate_id));
  let prunedCacheEntries=0;
  for(const key of Object.keys(state.results||{})){
    if(requestedKeys.has(key)) continue;
    delete state.results[key];
    prunedCacheEntries+=1;
  }
  const allowedScenes=[];
  for(const item of plan.requests){
    if(!allowedScenes.includes(item.scene_id)&&allowedScenes.length<maxScenes) allowedScenes.push(item.scene_id);
  }
  let cacheHits=0,generated=0,invalidatedCacheEntries=0;
  for(const item of plan.requests){
    if(!allowedScenes.includes(item.scene_id)) continue;
    const key=item.candidate_id;
    const requestFingerprint=imageRequestFingerprint(item);
    const prior=state.results[key];
    if(outputsStillExist(prior,requestFingerprint)){cacheHits+=1;continue;}
    if(prior?.status==="completed"&&Array.isArray(prior.outputs)&&prior.outputs.length){
      invalidatedCacheEntries+=1;
    }
    const candidateStartedMs=Number(now());
    try{
      let result;
      let fallbackUsed=false;
      let primaryError="";
      let primaryElapsedMs=null;
      let fallbackElapsedMs=null;
      const primaryStartedMs=Number(now());
      try{
        result=await runner(item.request);
        primaryElapsedMs=Math.max(0,Number(now())-primaryStartedMs);
      }catch(error){
        primaryElapsedMs=Math.max(0,Number(now())-primaryStartedMs);
        if(!isCudaOom(error)||!item.fallback_request) throw error;
        primaryError=String(error?.message||error).slice(0,500);
        const fallbackStartedMs=Number(now());
        result=await runner(item.fallback_request);
        fallbackElapsedMs=Math.max(0,Number(now())-fallbackStartedMs);
        fallbackUsed=true;
      }
      const candidateFinishedMs=Number(now());
      const elapsedMs=Math.max(0,candidateFinishedMs-candidateStartedMs);
      generatedCandidateDurations.push(elapsedMs);
      state.results[key]={
        status:"completed",scene_id:item.scene_id,candidate:item.candidate,seed:item.seed,
        request_fingerprint:requestFingerprint,
        job_id:result.job_id,request_sha256:result.request_sha256,outputs:result.outputs||[],attempts:result.attempts??null,
        fallback_used:fallbackUsed,primary_error:primaryError,error:"",
        generation_started_at:new Date(candidateStartedMs).toISOString(),
        generation_finished_at:new Date(candidateFinishedMs).toISOString(),
        elapsed_ms:elapsedMs,
        primary_elapsed_ms:primaryElapsedMs,
        fallback_elapsed_ms:fallbackElapsedMs
      };
      generated+=1;
      writeState(manifestPath,state);
    }catch(error){
      const candidateFinishedMs=Number(now());
      state.results[key]={
        status:"error",scene_id:item.scene_id,candidate:item.candidate,seed:item.seed,outputs:[],
        request_fingerprint:requestFingerprint,
        fallback_used:false,error:String(error?.message||error).slice(0,700),
        generation_started_at:new Date(candidateStartedMs).toISOString(),
        generation_finished_at:new Date(candidateFinishedMs).toISOString(),
        elapsed_ms:Math.max(0,candidateFinishedMs-candidateStartedMs)
      };
      writeState(manifestPath,state);
      throw error;
    }
  }
  const selections={};
  for(const sceneId of allowedScenes){
    const entries=Object.values(state.results).filter(r=>r.scene_id===sceneId&&r.status==="completed");
    selections[sceneId]={
      candidates:entries.flatMap(r=>r.outputs.map(o=>o.path)),
      selected:null,
      selection_reason:"",
      human_selection_required:true
    };
  }
  if(selectionTemplatePath){
    mkdirSync(dirname(resolve(selectionTemplatePath)),{recursive:true});
    writeFileSync(resolve(selectionTemplatePath),JSON.stringify(selections,null,2));
  }
  const runFinishedMs=Number(now());
  const generatedCandidateElapsedMs=generatedCandidateDurations.reduce((sum,value)=>sum+value,0);
  state.updated_at=new Date(runFinishedMs).toISOString();
  state.scene_count_processed=allowedScenes.length;
  state.run_timing={
    started_at:new Date(runStartedMs).toISOString(),
    finished_at:new Date(runFinishedMs).toISOString(),
    elapsed_ms:Math.max(0,runFinishedMs-runStartedMs),
    generated_candidate_count:generatedCandidateDurations.length,
    generated_candidate_elapsed_ms:generatedCandidateElapsedMs,
    mean_generated_candidate_elapsed_ms:generatedCandidateDurations.length
      ? generatedCandidateElapsedMs/generatedCandidateDurations.length
      : null
  };
  state.cache_hits=cacheHits;
  state.cache_invalidations=invalidatedCacheEntries;
  state.cache_pruned_entries=prunedCacheEntries;
  state.generated_this_run=generated;
  state.paid_fallback=false;
  writeState(manifestPath,state);
  return {
    manifest:state,
    selections,
    cache_hits:cacheHits,
    cache_invalidations:invalidatedCacheEntries,
    cache_pruned_entries:prunedCacheEntries,
    generated_this_run:generated,
    timing:state.run_timing
  };
}

if(import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [planPath,manifestPath,selectionPath,...rest]=process.argv.slice(2);
  if(!planPath||!manifestPath||!selectionPath) fail("usage: video-image-batch.mjs image-plan.json batch-manifest.json selections.template.json [--max-scenes=N]");
  const plan=JSON.parse(readFileSync(resolve(planPath),"utf8"));
  const flag=rest.find(x=>x.startsWith("--max-scenes="));
  const maxScenes=flag?Number(flag.split("=")[1]):Infinity;
  if(!Number.isFinite(maxScenes)&&maxScenes!==Infinity) fail("invalid --max-scenes");
  const result=await executeImagePlan(plan,{manifestPath,selectionTemplatePath:selectionPath,maxScenes});
  process.stdout.write(JSON.stringify({
    ok:true,
    cache_hits:result.cache_hits,
    cache_invalidations:result.cache_invalidations,
    cache_pruned_entries:result.cache_pruned_entries,
    generated_this_run:result.generated_this_run,
    timing:result.timing
  })+"\n");
}
