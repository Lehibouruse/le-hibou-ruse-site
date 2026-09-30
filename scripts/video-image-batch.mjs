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
export function isImageFallbackError(error){
  const message=String(error?.message||error||"");
  return isCudaOom(error) || /ComfyUI timeout waiting for history|AbortError|fetch failed|ECONNRESET|ETIMEDOUT/i.test(message);
}
function stable(value){
  if(Array.isArray(value)) return value.map(stable);
  if(value&&typeof value==="object"){
    return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));
  }
  return value;
}
function effectiveRequestForFingerprint(request){
  if(!request||typeof request!=="object") return request||null;
  const copy=structuredClone(request);
  delete copy.prompt_contract_ref;
  return copy;
}
export function imageRequestFingerprint(item){
  return createHash("sha256")
    .update(JSON.stringify(stable({
      request:effectiveRequestForFingerprint(item?.request||null),
      fallback_request:effectiveRequestForFingerprint(item?.fallback_request||null)
    })))
    .digest("hex");
}
export function promptApplicationVerified(request){
  const app=request?.prompt_application;
  if(!["HIBOU_IMAGE_PROMPT_APPLICATION_V1","HIBOU_IMAGE_PROMPT_APPLICATION_V2"].includes(app?.schema)) return false;
  const nodeId=String(app.prompt_node_id||"");
  const input=String(app.prompt_input||"");
  const prompt=request?.overrides?.[nodeId]?.[input];
  if(typeof prompt!=="string"||!prompt.length) return false;
  const sha=createHash("sha256").update(prompt).digest("hex");
  if(sha!==String(app.compiled_prompt_sha256||"")) return false;
  if(!Boolean(app.image_prompt_component_included||app.visual_idea_component_included)) return false;
  if(app.schema==="HIBOU_IMAGE_PROMPT_APPLICATION_V2"){
    if(app?.preservation?.status!=="PASS") return false;
    if(app.compiled_image_prompt_sha256&&typeof app.compiled_image_prompt_sha256!=="string") return false;
    if(app.compiled_visual_idea_sha256&&typeof app.compiled_visual_idea_sha256!=="string") return false;
  }
  return true;
}
export function executionReceiptVerified(request,result){
  const app=request?.prompt_application;
  const receipt=result?.execution_receipt;
  if(!app||receipt?.schema!=="HIBOU_COMFY_PROMPT_EXECUTION_V1"||receipt.prompt_verified!==true) return false;
  const expected=String(app.compiled_prompt_sha256||"");
  return Boolean(expected)
    && receipt.compiled_prompt_sha256===expected
    && receipt.applied_prompt_sha256===expected
    && /^[a-f0-9]{64}$/i.test(String(receipt.workflow_sha256||""));
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
  const targetedRegeneration=Boolean(plan?.regeneration);
  if(!targetedRegeneration){
    for(const key of Object.keys(state.results||{})){
      if(requestedKeys.has(key)) continue;
      delete state.results[key];
      prunedCacheEntries+=1;
    }
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
    const promptContractRef=structuredClone(
      item?.request?.prompt_contract_ref || item?.fallback_request?.prompt_contract_ref || null
    );
    const prior=state.results[key];
    const cachedRequest=prior?.fallback_used?item.fallback_request:item.request;
    const strictPromptProofRequired=promptContractRef?.schema==="HIBOU_PROMPT_CONTRACT_REF_V2";
    const cachedApplicationVerified=promptApplicationVerified(cachedRequest);
    const cachedExecutionVerified=executionReceiptVerified(cachedRequest,prior);
    if(outputsStillExist(prior,requestFingerprint)&&(
      !strictPromptProofRequired||(cachedApplicationVerified&&cachedExecutionVerified)
    )){
      prior.prompt_contract_ref=promptContractRef;
      prior.prompt_application=structuredClone(cachedRequest?.prompt_application||null);
      prior.execution_receipt=structuredClone(prior?.execution_receipt||null);
      prior.prompt_contract_execution_verified=
        strictPromptProofRequired&&cachedApplicationVerified&&cachedExecutionVerified;
      cacheHits+=1;
      continue;
    }
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
      const primaryTimeout=Math.max(30,Number(process.env.HIBOU_IMAGE_PRIMARY_TIMEOUT_SECONDS||180));
      const fallbackTimeout=Math.max(60,Number(process.env.HIBOU_IMAGE_FALLBACK_TIMEOUT_SECONDS||300));
      const forceFallback=String(process.env.HIBOU_IMAGE_FORCE_FALLBACK||"").toLowerCase()==="true";
      if(forceFallback&&item.fallback_request){
        primaryElapsedMs=0;
        primaryError="forced_fallback_profile";
        const fallbackStartedMs=Number(now());
        result=await runner({...item.fallback_request,timeout_seconds:Math.min(Number(item.fallback_request?.timeout_seconds||fallbackTimeout),fallbackTimeout)});
        fallbackElapsedMs=Math.max(0,Number(now())-fallbackStartedMs);
        fallbackUsed=true;
      }else{
        try{
          result=await runner({...item.request,timeout_seconds:Math.min(Number(item.request?.timeout_seconds||primaryTimeout),primaryTimeout)});
          primaryElapsedMs=Math.max(0,Number(now())-primaryStartedMs);
        }catch(error){
          primaryElapsedMs=Math.max(0,Number(now())-primaryStartedMs);
          if(!isImageFallbackError(error)||!item.fallback_request) throw error;
          primaryError=String(error?.message||error).slice(0,500);
          const fallbackStartedMs=Number(now());
          result=await runner({...item.fallback_request,timeout_seconds:Math.min(Number(item.fallback_request?.timeout_seconds||fallbackTimeout),fallbackTimeout)});
          fallbackElapsedMs=Math.max(0,Number(now())-fallbackStartedMs);
          fallbackUsed=true;
        }
      }
      const candidateFinishedMs=Number(now());
      const elapsedMs=Math.max(0,candidateFinishedMs-candidateStartedMs);
      generatedCandidateDurations.push(elapsedMs);
      const executedRequest=fallbackUsed?item.fallback_request:item.request;
      const applicationVerified=promptApplicationVerified(executedRequest);
      const executionVerified=executionReceiptVerified(executedRequest,result);
      state.results[key]={
        status:"completed",scene_id:item.scene_id,candidate:item.candidate,seed:item.seed,
        request_fingerprint:requestFingerprint,
        job_id:result.job_id,request_sha256:result.request_sha256,outputs:result.outputs||[],attempts:result.attempts??null,
        prompt_contract_ref:promptContractRef,
        prompt_application:structuredClone(executedRequest?.prompt_application||null),
        execution_receipt:structuredClone(result?.execution_receipt||null),
        prompt_contract_execution_verified:
          promptContractRef?.schema==="HIBOU_PROMPT_CONTRACT_REF_V2"&&applicationVerified&&executionVerified,
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
        prompt_contract_ref:promptContractRef,
        prompt_contract_execution_verified:false,
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
