#!/usr/bin/env node
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

function fail(message){ throw new Error(message); }
function sha256(path){ return createHash("sha256").update(readFileSync(path)).digest("hex"); }
function json(path){ return JSON.parse(readFileSync(resolve(path),"utf8")); }
function writeJson(path,value){ mkdirSync(dirname(resolve(path)),{recursive:true}); writeFileSync(resolve(path),JSON.stringify(value,null,2)+"\n"); }
function envFlag(name){ return String(process.env[name]||"").trim().toLowerCase()==="true"; }
function contractFeature(contract,name,envName){ return contract?.features?.[name]===true && envFlag(envName); }
async function ensureCanonicalReference(storyboardData, root){
  const creative=storyboardData?.creative||{};
  const url=String(creative.reference_image_url||"").trim();
  const repoPath=String(creative.reference_asset_repo_path||"").trim();
  const commit=String(storyboardData?.runtime_commit||"").trim().toLowerCase();
  if(!url&&!repoPath) return null;
  const dir=resolve(root,"reference");
  mkdirSync(dir,{recursive:true});
  const target=resolve(dir,"hibou-canonical.webp");
  if(!existsSync(target)){
    let bytes=null;
    if(repoPath){
      if(!/^[0-9a-f]{40}$/.test(commit)) fail("canonical Hibou asset requires valid runtime_commit");
      const assetUrl=`https://raw.githubusercontent.com/Lehibouruse/le-hibou-ruse-site/${commit}/${repoPath}`;
      const response=await fetch(assetUrl,{headers:{"User-Agent":"Le-Hibou-Video-Master/1.0","Cache-Control":"no-cache",Pragma:"no-cache"}});
      if(!response.ok) fail(`canonical Hibou embedded asset download failed HTTP ${response.status}`);
      const encoded=(await response.text()).replace(/\\s+/g,"");
      bytes=Buffer.from(encoded,"base64");
    }else{
      const response=await fetch(url,{headers:{"User-Agent":"Le-Hibou-Video-Master/1.0","Cache-Control":"no-cache",Pragma:"no-cache"}});
      if(!response.ok) fail(`canonical Hibou reference download failed HTTP ${response.status}`);
      bytes=Buffer.from(await response.arrayBuffer());
    }
    if(!bytes||bytes.length<10_000) fail("canonical Hibou reference download unexpectedly small");
    if(bytes.toString("ascii",0,4)!=="RIFF"||bytes.toString("ascii",8,12)!=="WEBP"){
      fail("canonical Hibou reference is not a valid WebP payload");
    }
    writeFileSync(target,bytes);
  }
  storyboardData.creative={
    ...creative,
    reference_image_local:target,
    reference_image_sha256:sha256(target),
    reference_mode:"deterministic_character_overlay"
  };
  return target;
}
function run(command,args,{env={}}={}){
  const r=spawnSync(command,args,{
    encoding:"utf8",
    windowsHide:true,
    shell:false,
    env:{...process.env,...env},
    maxBuffer:32*1024*1024
  });
  if(r.stdout) process.stdout.write(r.stdout);
  if(r.stderr) process.stderr.write(r.stderr);
  if(r.status!==0){
    const tail=String(r.stderr||r.stdout||"").slice(-12000);
    fail(command+" failed with status "+r.status+(tail?"\n"+tail:""));
  }
}
function flag(name){ return process.argv.includes("--"+name); }
function arg(name,fallback=""){
  const prefix="--"+name+"=";
  const hit=process.argv.find(x=>x.startsWith(prefix));
  return hit?hit.slice(prefix.length):fallback;
}
function pythonCommand(){
  const explicit=String(process.env.HIBOU_PYTHON||"").trim();
  if(explicit) return {cmd:explicit,prefix:[]};
  if(process.platform==="win32") return {cmd:"py",prefix:["-3.11"]};
  return {cmd:"python3.11",prefix:[]};
}
function chatterboxBatchScript(){
  const explicit=String(process.env.HIBOU_CHATTERBOX_BATCH_SCRIPT||"").trim();
  return explicit?resolve(explicit):resolve("scripts/chatterbox-storyboard-batch.py");
}

const PRE_IMAGE_RUNTIME_FILES=[
  ["video-audio-master.mjs","masterAudio"],
  ["video-audio-mix.mjs","HIBOU_AUDIO_MIX_V1"],
  ["video-prosody-plan.mjs","HIBOU_PROSODY_PLAN_V1"],
  ["video-voice-duration-qc.mjs","HIBOU_VOICE_DURATION_QC_V1"],
  ["video-hibou-pose-registry.mjs","HIBOU_POSE_REGISTRY_V1"],
  ["video-layer-guard.mjs","HIBOU_GLOBAL_SPECIFIC_GUARD_V1"],
  ["hibou-poses.registry.v1.json","HIBOU_POSE_REGISTRY_V1","video/assets/hibou-poses.registry.v1.json"],
  ["video-attach-mastered-audio.mjs","attachMasteredAudio"],
  ["video-subtitles.mjs","buildAss"],
  ["video-attach-subtitles.mjs","attachSubtitles"],
  ["video-style-apply.mjs","applyStyleProfile"],
  ["video-asset-resolve.mjs","applyAssetResolution"],
  ["video-asset-graph.mjs","planSceneAssetReuse"],
  ["video-iteration-plan.mjs","HIBOU_INCREMENTAL_RETOUCH_PLAN_V1"]
];

async function ensurePreImageRuntimeBundle(commit){
  const normalized=String(commit||"").trim().toLowerCase();
  if(!/^[0-9a-f]{40}$/.test(normalized)) fail("storyboard runtime_commit missing or invalid");
  const localBase=resolve(
    process.env.LOCALAPPDATA||dirname(resolve(process.argv[1])),
    "LeHibou","pre-image-runtime",normalized
  );
  mkdirSync(localBase,{recursive:true});
  for(const [name,marker,sourcePath] of PRE_IMAGE_RUNTIME_FILES){
    const target=resolve(localBase,name);
    let source=existsSync(target)?readFileSync(target,"utf8"):"";
    if(!source.includes(marker)){
      const repoPath=sourcePath||`scripts/${name}`;
      const url=`https://raw.githubusercontent.com/Lehibouruse/le-hibou-ruse-site/${normalized}/${repoPath}`;
      const response=await fetch(url,{headers:{"User-Agent":"Le-Hibou-Video-Master/1.0","Cache-Control":"no-cache",Pragma:"no-cache"}});
      if(!response.ok) fail(`pre-image runtime download failed HTTP ${response.status}: ${name}@${normalized}`);
      source=await response.text();
      if(!source.includes(marker)) fail(`pre-image runtime marker missing: ${name}@${normalized}`);
      writeFileSync(target,source,"utf8");
    }
  }
  return {
    audioMaster:resolve(localBase,"video-audio-master.mjs"),
    audioMix:resolve(localBase,"video-audio-mix.mjs"),
    prosody:resolve(localBase,"video-prosody-plan.mjs"),
    voiceDurationQc:resolve(localBase,"video-voice-duration-qc.mjs"),
    poseRegistryScript:resolve(localBase,"video-hibou-pose-registry.mjs"),
    layerGuard:resolve(localBase,"video-layer-guard.mjs"),
    poseRegistry:resolve(localBase,"hibou-poses.registry.v1.json"),
    attachAudio:resolve(localBase,"video-attach-mastered-audio.mjs"),
    subtitles:resolve(localBase,"video-subtitles.mjs"),
    attachSubtitles:resolve(localBase,"video-attach-subtitles.mjs"),
    style:resolve(localBase,"video-style-apply.mjs"),
    assetResolve:resolve(localBase,"video-asset-resolve.mjs"),
    iterationPlan:resolve(localBase,"video-iteration-plan.mjs")
  };
}

const IMAGE_RUNTIME_FILES=[
  ["video-image-factory.mjs","executeImagePlan","scripts/video-image-factory.mjs"],
  ["video-image-batch.mjs","runImageGen","scripts/video-image-batch.mjs"],
  ["video-local-adapters.mjs","ComfyUI /prompt returned no prompt_id","scripts/video-local-adapters.mjs"],
  ["video-image-plan.mjs","HIBOU_IMAGE_PLAN_V1","scripts/video-image-plan.mjs"],
  ["video-image-qc.mjs","HIBOU_IMAGE_BATCH_V1","scripts/video-image-qc.mjs"],
  ["video-image-regenerate.mjs","buildTargetedRegeneration","scripts/video-image-regenerate.mjs"],
  ["video-candidate-review.mjs","HIBOU_CANDIDATE_REVIEW_V1","scripts/video-candidate-review.mjs"],
  ["video-candidate-selection-apply.mjs","HIBOU_HUMAN_IMAGE_SELECTION_V1","scripts/video-candidate-selection-apply.mjs"],
  ["video-image-perceptual-qc.py","input must contain technical QC rows","scripts/video-image-perceptual-qc.py"],
  ["rog-g814ji-rtx4070-8gb.json","VALIDATED_LOCAL_BASELINE","video/hardware/rog-g814ji-rtx4070-8gb.json"]
];

async function ensureImageRuntimeBundle(commit){
  const normalized=String(commit||"").trim().toLowerCase();
  if(!/^[0-9a-f]{40}$/.test(normalized)) fail("storyboard runtime_commit missing or invalid");
  const localBase=resolve(
    process.env.LOCALAPPDATA||dirname(resolve(process.argv[1])),
    "LeHibou","image-runtime",normalized
  );
  mkdirSync(localBase,{recursive:true});
  for(const [name,marker,sourcePath] of IMAGE_RUNTIME_FILES){
    const target=resolve(localBase,name);
    let source=existsSync(target)?readFileSync(target,"utf8"):"";
    if(!source.includes(marker)){
      const url=`https://raw.githubusercontent.com/Lehibouruse/le-hibou-ruse-site/${normalized}/${sourcePath}`;
      const response=await fetch(url,{headers:{"User-Agent":"Le-Hibou-Video-Master/1.0","Cache-Control":"no-cache",Pragma:"no-cache"}});
      if(!response.ok) fail(`image runtime download failed HTTP ${response.status}: ${name}@${normalized}`);
      source=await response.text();
      if(!source.includes(marker)) fail(`image runtime marker missing: ${name}@${normalized}`);
      writeFileSync(target,source,"utf8");
    }
  }
  return resolve(localBase,"video-image-factory.mjs");
}

const POST_RUNTIME_FILES=[
  ["video-storyboard-promote.mjs","promoteStoryboard"],
  ["video-local-render.mjs","renderVideoContract"],
  ["video-scene-compositor.mjs","buildSceneCompositePlan"],
  ["video-master-qc.mjs","HIBOU_MASTER_QC_V2"],
  ["video-artifact-registry.mjs","HIBOU_VIDEO_ARTIFACT_REGISTRY_V2"],
  ["video-human-review-package.mjs","HIBOU_HUMAN_REVIEW_PACKAGE_V1"],
  ["video-review-diff.mjs","HIBOU_INCREMENTAL_REVIEW_DIFF_V1"],
  ["video-durable-storage-plan.mjs","HIBOU_DURABLE_STORAGE_PLAN_V1"],
  ["video-creative-qc.py","HIBOU_CREATIVE_QC_V1"]
];

async function ensurePostRuntimeBundle(commit){
  const normalized=String(commit||"").trim().toLowerCase();
  if(!/^[0-9a-f]{40}$/.test(normalized)) fail("storyboard runtime_commit missing or invalid");
  const localBase=resolve(
    process.env.LOCALAPPDATA||dirname(resolve(process.argv[1])),
    "LeHibou","post-runtime",normalized
  );
  mkdirSync(localBase,{recursive:true});
  for(const [name,marker] of POST_RUNTIME_FILES){
    const target=resolve(localBase,name);
    let source=existsSync(target)?readFileSync(target,"utf8"):"";
    if(!source.includes(marker)){
      const url=`https://raw.githubusercontent.com/Lehibouruse/le-hibou-ruse-site/${normalized}/scripts/${name}`;
      const response=await fetch(url,{headers:{"User-Agent":"Le-Hibou-Video-Master/1.0","Cache-Control":"no-cache",Pragma:"no-cache"}});
      if(!response.ok) fail(`post runtime download failed HTTP ${response.status}: ${name}@${normalized}`);
      source=await response.text();
      if(!source.includes(marker)) fail(`post runtime marker missing: ${name}@${normalized}`);
      writeFileSync(target,source,"utf8");
    }
  }
  return {
    promote:resolve(localBase,"video-storyboard-promote.mjs"),
    render:resolve(localBase,"video-local-render.mjs"),
    masterQc:resolve(localBase,"video-master-qc.mjs"),
    registry:resolve(localBase,"video-artifact-registry.mjs"),
    humanReview:resolve(localBase,"video-human-review-package.mjs"),
    reviewDiff:resolve(localBase,"video-review-diff.mjs"),
    storagePlan:resolve(localBase,"video-durable-storage-plan.mjs"),
    creativeQc:resolve(localBase,"video-creative-qc.py")
  };
}

function ensureSameRun(statePath,inputs){
  if(!existsSync(statePath)) return;
  const old=json(statePath);
  const current=JSON.stringify(inputs);
  if(JSON.stringify(old.inputs)!==current){
    fail("output root already belongs to different inputs; use a new output directory");
  }
}
export function seedIncrementalCaches(previousRootArg,currentRootArg){
  const previousRoot=resolve(previousRootArg);
  const currentRoot=resolve(currentRootArg);
  if(previousRoot===currentRoot) fail("reuse-from must reference a different output root");
  if(!existsSync(previousRoot)) fail("reuse-from output root missing: "+previousRoot);

  const seeded={
    schema:"HIBOU_INCREMENTAL_CACHE_SEED_V1",
    previous_root:previousRoot,
    current_root:currentRoot,
    voice_scene_cache:false,
    image_manifest:false,
    copied_image_outputs:0,
    render_cache:false
  };

  const previousVoice=resolve(previousRoot,"voice","voice-scenes");
  const currentVoice=resolve(currentRoot,"voice","voice-scenes");
  if(existsSync(previousVoice)&&!existsSync(currentVoice)){
    mkdirSync(dirname(currentVoice),{recursive:true});
    cpSync(previousVoice,currentVoice,{recursive:true,force:false,errorOnExist:false});
    seeded.voice_scene_cache=true;
  }

  const previousImageManifest=resolve(previousRoot,"images","batch-manifest.json");
  const currentImageManifest=resolve(currentRoot,"images","batch-manifest.json");
  if(existsSync(previousImageManifest)&&!existsSync(currentImageManifest)){
    const manifest=json(previousImageManifest);
    for(const result of Object.values(manifest?.results||{})){
      for(const output of Array.isArray(result?.outputs)?result.outputs:[]){
        const raw=String(output?.path||"").trim();
        if(!raw) continue;
        const source=isAbsolute(raw)?resolve(raw):resolve(previousRoot,raw);
        const insidePrevious=source===previousRoot||source.startsWith(previousRoot+sep);
        if(!insidePrevious||!existsSync(source)) continue;
        const target=resolve(currentRoot,relative(previousRoot,source));
        mkdirSync(dirname(target),{recursive:true});
        if(!existsSync(target)) cpSync(source,target,{force:false,errorOnExist:false});
        output.path=target;
        seeded.copied_image_outputs+=1;
      }
    }
    writeJson(currentImageManifest,manifest);
    seeded.image_manifest=true;
  }

  const previousRenderCache=resolve(previousRoot,".video-render-cache");
  const currentRenderCache=resolve(currentRoot,".video-render-cache");
  if(existsSync(previousRenderCache)&&!existsSync(currentRenderCache)){
    cpSync(previousRenderCache,currentRenderCache,{recursive:true,force:false,errorOnExist:false});
    seeded.render_cache=true;
  }

  return seeded;
}

export function masterPolicy({maxScenes=20,regenAttempts=1}={}){
  const scenes=Number(maxScenes), retries=Number(regenAttempts);
  if(!Number.isInteger(scenes)||scenes<1||scenes>25) fail("maxScenes must be 1..25");
  if(!Number.isInteger(retries)||retries<0||retries>2) fail("regenAttempts must be 0..2");
  return {
    max_scenes:scenes,
    regeneration_attempts:retries,
    technical_selection_allowed:true,
    human_master_review_required:true,
    publication_authorized:false,
    paid_fallback:false
  };
}
export function normalizeExecutionProfileOverride({mode="",candidates=""}={}){
  const rawMode=String(mode||"").trim().toLowerCase();
  if(rawMode && !["preview","final"].includes(rawMode)){
    fail("production-mode override must be preview or final");
  }
  let candidateCount=null;
  if(String(candidates??"").trim()!==""){
    candidateCount=Number(candidates);
    if(!Number.isInteger(candidateCount)||candidateCount<1||candidateCount>3){
      fail("candidates-per-scene override must be 1..3");
    }
  }
  return {
    production_mode:rawMode||null,
    candidates_per_scene:candidateCount
  };
}

export function buildTechnicalSelections(provisional){
  const out={};
  for(const [sceneId,pick] of Object.entries(provisional||{})){
    if(pick?.status!=="PROVISIONAL_QC_PASS"||!pick?.selected_path) fail(sceneId+": no QC PASS image");
    out[sceneId]={
      candidates:[pick.selected_path],
      selected:pick.selected_path,
      selection_reason:"automatic technical QC selection; final master human review required"
    };
  }
  if(!Object.keys(out).length) fail("no technical selections available");
  return out;
}
function stage(state,name,fn){
  if(state.stages[name]?.status==="PASS") return false;
  state.stage_history=Array.isArray(state.stage_history)?state.stage_history:[];
  const attempt=
    state.stage_history.filter(
      entry=>entry?.stage===name&&entry?.event==="START"
    ).length+1;
  const startedMs=Date.now();
  const startedAt=new Date(startedMs).toISOString();
  state.stages[name]={
    status:"RUNNING",
    started_at:startedAt,
    attempt
  };
  state.stage_history.push({
    stage:name,
    event:"START",
    attempt,
    at:startedAt
  });
  writeJson(state.path,state);
  try{
    fn();
    const finishedMs=Date.now();
    const finishedAt=new Date(finishedMs).toISOString();
    const durationMs=Math.max(0,finishedMs-startedMs);
    state.stages[name]={
      status:"PASS",
      started_at:startedAt,
      finished_at:finishedAt,
      duration_ms:durationMs,
      attempt
    };
    state.stage_history.push({
      stage:name,
      event:"PASS",
      attempt,
      at:finishedAt,
      duration_ms:durationMs
    });
    writeJson(state.path,state);
    return true;
  }catch(error){
    const finishedMs=Date.now();
    const finishedAt=new Date(finishedMs).toISOString();
    const durationMs=Math.max(0,finishedMs-startedMs);
    const fullError=String(error?.stack||error?.message||error);
    const head=fullError.slice(0,1200);
    const tail=fullError.length>1200?fullError.slice(-6800):"";
    const stageError=tail?head+"\n--- error tail ---\n"+tail:head;
    state.stages[name]={
      status:"ERROR",
      started_at:startedAt,
      finished_at:finishedAt,
      duration_ms:durationMs,
      attempt,
      error:stageError
    };
    state.stage_history.push({
      stage:name,
      event:"ERROR",
      attempt,
      at:finishedAt,
      duration_ms:durationMs,
      error:stageError.slice(0,2000)
    });
    writeJson(state.path,state);
    throw error;
  }
}
async function main(){
  const contentId=arg("content","");
  const storyboardArg=arg("storyboard","");
  const bindingArg=arg("binding","");
  const outputArg=arg("output","");
  const styleArg=arg("style","");
  const assetGraphArg=arg("asset-graph","");
  const reuseFromArg=arg("reuse-from","");
  const productionModeArg=arg("production-mode","");
  const candidatesPerSceneArg=arg("candidates-per-scene","");
  const maxScenes=Number(arg("max-scenes","20"));
  const regenAttempts=Number(arg("regen-attempts","1"));
  const reportAirtable=flag("report-airtable");
  const planOnly=flag("plan-only");
  if(!outputArg) fail("--output=<dir> required");
  if(!bindingArg) fail("--binding=<comfyui-binding.json> required");
  if(Boolean(contentId)===Boolean(storyboardArg)) fail("provide exactly one of --content=<Airtable record> or --storyboard=<json>");
  if(!existsSync(resolve(bindingArg))) fail("binding file missing");
  if(styleArg&&!existsSync(resolve(styleArg))) fail("style profile missing");
  if(assetGraphArg&&!existsSync(resolve(assetGraphArg))) fail("asset graph missing");

  const policy=masterPolicy({maxScenes,regenAttempts});
  const executionOverride=normalizeExecutionProfileOverride({
    mode:productionModeArg,
    candidates:candidatesPerSceneArg
  });
  const root=resolve(outputArg);
  mkdirSync(root,{recursive:true});
  const storyboard=resolve(root,"storyboard.json");
  const statePath=resolve(root,"pipeline-run.json");
  const inputs={
    source:contentId?{type:"airtable",content_id:contentId}:{type:"file",path:resolve(storyboardArg),sha256:sha256(resolve(storyboardArg))},
    binding:{path:resolve(bindingArg),sha256:sha256(resolve(bindingArg))},
    style:styleArg?{path:resolve(styleArg),sha256:sha256(resolve(styleArg))}:null,
    asset_graph:assetGraphArg?{path:resolve(assetGraphArg),sha256:sha256(resolve(assetGraphArg))}:null,
    reuse_from:reuseFromArg?{
      root:resolve(reuseFromArg),
      storyboard_sha256:existsSync(resolve(reuseFromArg,"storyboard.json"))?sha256(resolve(reuseFromArg,"storyboard.json")):null
    }:null,
    execution_override:executionOverride,
    policy
  };
  ensureSameRun(statePath,inputs);
  const state=existsSync(statePath)?json(statePath):{
    schema:"HIBOU_VIDEO_MASTER_RUN_V1",
    created_at:new Date().toISOString(),
    path:statePath,
    root,
    inputs,
    stages:{},
    publication_authorized:false
  };
  state.path=statePath;
  writeJson(statePath,state);

  if(planOnly){
    process.stdout.write(JSON.stringify({ok:true,mode:"plan_only",root,inputs,stages:[
      "storyboard","prosody","voice","voice_duration_qc","audio_master","music_mix","audio_attach","subtitles","style","pose_registry","asset_resolution","images","technical_selection","creative_qc","promotion","render","master_qc","registry","airtable_report"
    ]},null,2)+"\n");
    return;
  }

  stage(state,"storyboard",()=>{
    if(contentId){
      run(process.execPath,[resolve("scripts/video-airtable-sync.mjs"),"export",contentId,storyboard]);
    }else{
      const source=resolve(storyboardArg);
      const data=json(source);
      if(data.contract_version!=="HIBOU_VIDEO_CONTRACT_V1"||data.contract_state!=="storyboard") fail("storyboard contract required");
      writeJson(storyboard,data);
    }
    const sb=json(storyboard);
    if((sb.scenes||[]).length>policy.max_scenes) fail("storyboard exceeds --max-scenes policy");
  });

  const storyboardData=json(storyboard);
  if(executionOverride.production_mode||executionOverride.candidates_per_scene!=null){
    storyboardData.production={
      ...(storyboardData.production||{}),
      ...(executionOverride.production_mode?{mode:executionOverride.production_mode}:{}),
      ...(executionOverride.candidates_per_scene!=null?{candidates_per_scene:executionOverride.candidates_per_scene}:{})
    };
    state.execution_profile={
      source:"job_override",
      production_mode:String(storyboardData.production.mode||"final"),
      candidates_per_scene:Number(storyboardData.production.candidates_per_scene||0)||null,
      global_visual_identity_unchanged:true,
      publication_authorized:false
    };
    writeJson(storyboard,storyboardData);
    writeJson(statePath,state);
  }else{
    state.execution_profile={
      source:"storyboard_global_default",
      production_mode:String(storyboardData.production?.mode||"final"),
      candidates_per_scene:Number(storyboardData.production?.candidates_per_scene||0)||null,
      global_visual_identity_unchanged:true,
      publication_authorized:false
    };
    writeJson(statePath,state);
  }
  const timelineEnabled=contractFeature(storyboardData,"video_timeline_v1","HIBOU_VIDEO_TIMELINE_V1");
  if(!timelineEnabled){
    let stripped=0;
    for(const scene of storyboardData.scenes||[]){
      if(scene.timeline){
        delete scene.timeline;
        stripped+=1;
      }
    }
    if(stripped){
      state.timeline_v1={enabled:false,stripped_scene_count:stripped,reason:"GLOBAL contract + runtime gate required"};
      writeJson(storyboard,storyboardData);
      writeJson(statePath,state);
    }
  }else{
    state.timeline_v1={enabled:true,stripped_scene_count:0};
    writeJson(statePath,state);
  }
  const canonicalReference=await ensureCanonicalReference(storyboardData,root);
  if(canonicalReference) writeJson(storyboard,storyboardData);

  const runtimeCommit=String(storyboardData.runtime_commit||"").trim();
  const preRuntime=await ensurePreImageRuntimeBundle(runtimeCommit);
  {
    const guardModule=await import(pathToFileURL(preRuntime.layerGuard).href+"?v="+Date.now());
    const separation=guardModule.validateGlobalSpecificSeparation(storyboardData);
    state.global_specific_guard=separation;
    writeJson(statePath,state);
  }

  const incrementalEnabled=contractFeature(
    storyboardData,
    "video_incremental_retouch_v1",
    "HIBOU_VIDEO_INCREMENTAL_RETOUCH_V1"
  );
  const incrementalPlanPath=resolve(root,"incremental-retouch-plan.json");
  if(reuseFromArg&&!incrementalEnabled){
    fail("--reuse-from requires GLOBAL video_incremental_retouch_v1 and HIBOU_VIDEO_INCREMENTAL_RETOUCH_V1=true");
  }
  if(incrementalEnabled&&reuseFromArg){
    const previousRoot=resolve(reuseFromArg);
    const previousStoryboard=resolve(previousRoot,"storyboard.json");
    if(!existsSync(previousStoryboard)) fail("reuse-from storyboard.json missing: "+previousStoryboard);
    const planner=await import(pathToFileURL(preRuntime.iterationPlan).href+"?v="+Date.now());
    const iterationPlan=planner.buildIterationPlan(json(previousStoryboard),storyboardData);
    writeJson(incrementalPlanPath,iterationPlan);
    const cacheSeed=seedIncrementalCaches(previousRoot,root);
    state.incremental_retouch={
      enabled:true,
      reuse_from:previousRoot,
      plan:incrementalPlanPath,
      changed_scene_ids:iterationPlan.changed_scene_ids||[],
      invalidated_stages:iterationPlan.invalidated_stages||[],
      cache_seed:cacheSeed
    };
    writeJson(statePath,state);
  }else{
    state.incremental_retouch={
      enabled:false,
      reason:reuseFromArg?"feature gate disabled":"no reuse-from requested"
    };
    writeJson(statePath,state);
  }

  const prosodyEnabled=contractFeature(storyboardData,"video_prosody_v1","HIBOU_VIDEO_PROSODY_V1");
  const prosodyStoryboard=resolve(root,"storyboard-prosody.json");
  if(prosodyEnabled){
    stage(state,"prosody",()=>run(process.execPath,[preRuntime.prosody,storyboard,prosodyStoryboard]));
  }else if(!state.stages.prosody){
    state.stages.prosody={status:"SKIPPED",reason:"GLOBAL contract + runtime gate required"};
    writeJson(statePath,state);
  }
  const voiceInput=prosodyEnabled?prosodyStoryboard:storyboard;

  const voiceDir=resolve(root,"voice");
  const voiceReady=resolve(voiceDir,"contract-audio-ready.json");
  const rawVoice=resolve(voiceDir,"voice-master.wav");
  stage(state,"voice",()=>{
    const py=pythonCommand();
    const voiceScript=chatterboxBatchScript();
    if(!existsSync(voiceScript)) fail("chatterbox batch script missing: "+voiceScript);
    run(py.cmd,[...py.prefix,voiceScript,voiceInput,voiceDir]);
    if(!existsSync(voiceReady)||!existsSync(rawVoice)) fail("voice outputs missing");
  });

  const voiceBatchManifest=resolve(voiceDir,"voice-batch-manifest.json");
  const voiceDurationQc=resolve(voiceDir,"voice-duration-qc.json");
  stage(state,"voice_duration_qc",()=>{
    if(!existsSync(voiceBatchManifest)) fail("voice batch manifest missing");
    run(process.execPath,[preRuntime.voiceDurationQc,voiceBatchManifest,voiceDurationQc]);
    const report=json(voiceDurationQc);
    state.voice_duration_qc={
      status:String(report.status||""),
      rejected_scene_ids:Array.isArray(report.rejected_scene_ids)?report.rejected_scene_ids:[],
      rejected_scene_count:Number(report.rejected_scene_count||0),
      publication_authorized:false
    };
    writeJson(statePath,state);
    if(report.status!=="PASS"){
      fail("voice duration QC rejected scenes: "+state.voice_duration_qc.rejected_scene_ids.join(","));
    }
  });

  const voiceMastered=resolve(voiceDir,"voice-mastered.wav");
  stage(state,"audio_master",()=>run(process.execPath,[preRuntime.audioMaster,rawVoice,voiceMastered]));

  const musicEnabled=contractFeature(storyboardData,"video_music_mix_v1","HIBOU_VIDEO_MUSIC_V1");
  const musicMixed=resolve(voiceDir,"voice-music-mixed.wav");
  const musicConfigPath=resolve(root,"music-global.json");
  if(musicEnabled){
    stage(state,"music_mix",()=>{
      const globalMusic={...(storyboardData.music||{})};
      if(!globalMusic.reference) fail("video_music_mix_v1 enabled but GLOBAL music.reference missing");
      writeJson(musicConfigPath,globalMusic);
      run(process.execPath,[preRuntime.audioMix,voiceMastered,musicConfigPath,musicMixed]);
    });
  }else if(!state.stages.music_mix){
    state.stages.music_mix={status:"SKIPPED",reason:"GLOBAL contract + runtime gate required"};
    writeJson(statePath,state);
  }

  const mastered=musicEnabled?musicMixed:voiceMastered;
  const masteredContract=resolve(root,"contract-mastered.json");
  stage(state,"audio_attach",()=>run(process.execPath,[preRuntime.attachAudio,voiceReady,mastered,masteredContract]));

  const ass=resolve(root,"subtitles.ass");
  const captioned=resolve(root,"contract-captioned.json");
  stage(state,"subtitles",()=>{
    run(process.execPath,[preRuntime.subtitles,masteredContract,ass]);
    run(process.execPath,[preRuntime.attachSubtitles,masteredContract,ass,captioned]);
  });

  const styled=resolve(root,"contract-styled.json");
  stage(state,"style",()=>{
    if(styleArg) run(process.execPath,[preRuntime.style,captioned,resolve(styleArg),styled]);
    else writeJson(styled,json(captioned));
  });

  const poseRegistryEnabled=contractFeature(storyboardData,"video_pose_registry_v1","HIBOU_VIDEO_POSE_REGISTRY_V1");
  const posed=resolve(root,"contract-posed.json");
  if(poseRegistryEnabled){
    stage(state,"pose_registry",()=>{
      run(process.execPath,[preRuntime.poseRegistryScript,styled,preRuntime.poseRegistry,posed]);
      const p=json(posed).pose_registry_application||{};
      state.pose_registry={
        applied_scenes:Number(p.applied_scenes||0),
        unresolved_scenes:Number(p.unresolved_scenes||0),
        generation_requested:false
      };
      writeJson(statePath,state);
    });
  }else{
    if(!existsSync(posed)) writeJson(posed,json(styled));
    if(!state.stages.pose_registry){
      state.stages.pose_registry={status:"SKIPPED",reason:"GLOBAL contract + runtime gate required"};
      writeJson(statePath,state);
    }
  }

  const assetResolved=resolve(root,"contract-assets-resolved.json");
  stage(state,"asset_resolution",()=>{
    if(assetGraphArg){
      run(process.execPath,[preRuntime.assetResolve,posed,resolve(assetGraphArg),assetResolved]);
    }else{
      writeJson(assetResolved,json(posed));
    }
    const resolved=json(assetResolved);
    state.asset_resolution={
      enabled:Boolean(assetGraphArg),
      full_reuse_scenes:resolved.asset_resolution?.full_reuse_scenes?.length||0,
      generation_required_scenes:resolved.asset_resolution?.generation_required_scenes?.length||0,
      generation_slots:resolved.asset_resolution?.generation_slots?.length||0
    };
    writeJson(statePath,state);
  });

  const imageFactoryScript=await ensureImageRuntimeBundle(runtimeCommit);
  const imageSelectionApplyScript=resolve(
    dirname(imageFactoryScript),
    "video-candidate-selection-apply.mjs"
  );
  const postRuntime=await ensurePostRuntimeBundle(runtimeCommit);
  const imageDir=resolve(root,"images");
  stage(state,"images",()=>{
    run(process.execPath,[
      imageFactoryScript,
      assetResolved,resolve(bindingArg),imageDir,
      "--max-scenes="+policy.max_scenes,
      "--regen-attempts="+policy.regeneration_attempts
    ]);
    const result=json(resolve(imageDir,"factory-run.json"));
    const candidateReviewPath=resolve(imageDir,"candidate-review.json");
    if(existsSync(candidateReviewPath)){
      const review=json(candidateReviewPath);
      state.candidate_review={
        path:candidateReviewPath,
        html_path:existsSync(resolve(imageDir,"candidate-review.html"))?resolve(imageDir,"candidate-review.html"):null,
        schema:String(review.schema||""),
        scene_count:Number(review.scene_count||0),
        blocking_scene_count:Number(review.blocking_scene_count||0),
        all_scenes_reviewable:Boolean(review.all_scenes_reviewable),
        human_review_required:true,
        publication_authorized:false
      };
      writeJson(statePath,state);
    }
    if(result.all_scenes_have_candidate!==true){
      const diagnostic={
        technical_qc:result.technical_qc||null,
        perceptual_qc:result.perceptual_qc||null
      };
      fail("one or more scenes still have no QC PASS candidate; diagnostics="+JSON.stringify(diagnostic));
    }
  });

  const selections=resolve(imageDir,"selections.json");
  const candidateReviewPath=resolve(imageDir,"candidate-review.json");
  const candidateDecisionsPath=resolve(imageDir,"candidate-decisions.json");
  const humanSelectionManifest=resolve(imageDir,"candidate-selection-manifest.json");
  const humanSelectionFeatureEnabled=contractFeature(
    storyboardData,
    "video_human_candidate_selection_v1",
    "HIBOU_VIDEO_HUMAN_SELECTION_V1"
  );
  const humanSelectionEnabled=
    humanSelectionFeatureEnabled &&
    String(storyboardData.production?.mode||"final").toLowerCase()==="final";
  const candidateReviewData=existsSync(candidateReviewPath)?json(candidateReviewPath):null;
  const generatedCandidateSceneCount=Number(candidateReviewData?.scene_count||0);

  if(humanSelectionFeatureEnabled&&!humanSelectionEnabled){
    state.human_candidate_selection={
      enabled:false,
      reason:"preview_mode_does_not_pause_for_human_candidate_selection",
      review_path:existsSync(candidateReviewPath)?candidateReviewPath:null,
      publication_authorized:false
    };
    writeJson(statePath,state);
  }

  const waitingHumanSelectionPath=resolve(root,"awaiting-human-selection.json");

  if(
    humanSelectionEnabled &&
    generatedCandidateSceneCount>0 &&
    !existsSync(candidateDecisionsPath)
  ){
    const waitingPath=waitingHumanSelectionPath;
    const waiting={
      schema:"HIBOU_VIDEO_MASTER_WAITING_HUMAN_SELECTION_V1",
      status:"WAITING_HUMAN_SELECTION",
      root,
      candidate_review:candidateReviewPath,
      candidate_review_html:existsSync(resolve(imageDir,"candidate-review.html"))?resolve(imageDir,"candidate-review.html"):null,
      decisions_path:candidateDecisionsPath,
      scene_count:generatedCandidateSceneCount,
      resume_same_job:true,
      images_will_be_reused:true,
      human_review_required:true,
      publication_authorized:false
    };
    state.human_candidate_selection={
      enabled:true,
      status:"WAITING_HUMAN_SELECTION",
      review_path:candidateReviewPath,
      decisions_path:candidateDecisionsPath,
      scene_count:generatedCandidateSceneCount,
      resume_same_job:true,
      publication_authorized:false
    };
    state.pipeline_status="WAITING_HUMAN_SELECTION";
    writeJson(waitingPath,waiting);
    writeJson(statePath,state);
    process.stdout.write(JSON.stringify({ok:true,...waiting})+"\n");
    return;
  }

  stage(state,"technical_selection",()=>{
    const provisional=json(resolve(imageDir,"selections.provisional.json"));
    if(
      humanSelectionEnabled &&
      generatedCandidateSceneCount>0
    ){
      run(process.execPath,[
        imageSelectionApplyScript,
        candidateReviewPath,
        candidateDecisionsPath,
        selections,
        humanSelectionManifest
      ]);
      if(existsSync(waitingHumanSelectionPath)){
        unlinkSync(waitingHumanSelectionPath);
      }
      const humanManifest=json(humanSelectionManifest);
      state.human_candidate_selection={
        enabled:true,
        status:"HUMAN_SELECTION_APPLIED",
        review_path:candidateReviewPath,
        decisions_path:candidateDecisionsPath,
        manifest_path:humanSelectionManifest,
        selection_count:Number(humanManifest.selection_count||0),
        publication_authorized:false
      };
      state.pipeline_status="RUNNING_AFTER_HUMAN_SELECTION";
      writeJson(statePath,state);
    }else if(Object.keys(provisional||{}).length===0){
      writeJson(selections,{});
    }else{
      writeJson(selections,buildTechnicalSelections(provisional));
    }
  });

  const creativeQcEnabled=contractFeature(storyboardData,"video_creative_qc_v1","HIBOU_VIDEO_CREATIVE_QC_V1");
  const creativeQcManifest=resolve(root,"creative-qc-input.json");
  const creativeQcReport=resolve(root,"creative-qc.json");
  if(creativeQcEnabled){
    stage(state,"creative_qc",()=>{
      const resolvedContract=json(assetResolved);
      const picks=json(selections);
      const scenes=[];
      for(const scene of resolvedContract.scenes||[]){
        const pick=picks[scene.scene_id];
        let imagePath=pick?.selected?resolve(imageDir,pick.selected):"";
        if(!imagePath&&scene?.composition?.background){
          const raw=typeof scene.composition.background==="string"?scene.composition.background:String(scene.composition.background.path||scene.composition.background.reference||"");
          if(raw) imagePath=resolve(dirname(assetResolved),raw);
        }
        if(!imagePath) continue;
        scenes.push({
          scene_id:scene.scene_id,
          image:imagePath,
          brief:String(scene.image_prompt||scene.visual_idea||""),
          style_prompt:String(resolvedContract.creative?.style_lock||""),
          expected_hibou:Boolean(scene.framing?.hibou)
        });
      }
      writeJson(creativeQcManifest,{
        canonical_hibou:canonicalReference||null,
        thresholds:storyboardData.creative?.creative_qc?.thresholds||{},
        scenes
      });
      const py=pythonCommand();
      const model=String(storyboardData.creative?.creative_qc?.model||"").trim();
      const args=[...py.prefix,postRuntime.creativeQc,creativeQcManifest,"--output",creativeQcReport];
      if(model) args.push("--model",model);
      run(py.cmd,args);
      const report=json(creativeQcReport);
      state.creative_qc_status=report.status;
      state.creative_qc_failed_scene_count=Number(report.failed_scene_count||0);
      writeJson(statePath,state);
      if(report.status==="REJECT"&&storyboardData.creative?.creative_qc?.block_on_reject===true){
        fail("creative semantic QC rejected one or more scenes");
      }
    });
  }else if(!state.stages.creative_qc){
    state.stages.creative_qc={status:"SKIPPED",reason:"GLOBAL contract + runtime gate required"};
    writeJson(statePath,state);
  }

  const renderReady=resolve(root,"render-ready.json");
  stage(state,"promotion",()=>{
    run(process.execPath,[postRuntime.promote,assetResolved,selections,renderReady]);
  });

  const master=resolve(root,"master.mp4");
  stage(state,"render",()=>{
    run(process.execPath,[postRuntime.render,renderReady,master]);
  });

  const masterQc=resolve(root,"master-qc.json");
  stage(state,"master_qc",()=>{
    run(process.execPath,[postRuntime.masterQc,master,masterQc]);
    const qc=json(masterQc);
    if(!["PASS","REVIEW"].includes(qc.status)) fail("unexpected master QC status");
    state.master_qc_status=qc.status;
    state.publication_authorized=false;
    writeJson(statePath,state);
  });

  const masterResultPath=resolve(root,"master-result.json");
  const humanReview=resolve(root,"human-review.json");
  writeJson(masterResultPath,{
    schema:"HIBOU_VIDEO_MASTER_RESULT_DRAFT_V1",
    production_mode:String(storyboardData.production?.mode||"final").toLowerCase()==="preview"?"preview":"final",
    preview_only:String(storyboardData.production?.mode||"final").toLowerCase()==="preview",
    publication_authorized:false,
    features:{
      video_timeline_v1:timelineEnabled,
      video_prosody_v1:prosodyEnabled,
      video_music_mix_v1:musicEnabled,
      video_creative_qc_v1:creativeQcEnabled,
      video_pose_registry_v1:poseRegistryEnabled,
      video_incremental_retouch_v1:incrementalEnabled,
      video_human_candidate_selection_v1:humanSelectionEnabled
    }
  });
  const reviewDiff=resolve(root,"review-diff.json");
  if(incrementalEnabled&&reuseFromArg&&existsSync(incrementalPlanPath)){
    stage(state,"review_diff",()=>{
      run(process.execPath,[postRuntime.reviewDiff,incrementalPlanPath,reviewDiff]);
      const diff=json(reviewDiff);
      state.review_diff={
        path:reviewDiff,
        schema:String(diff.schema||""),
        review_scope:String(diff.review_scope||""),
        full_review_required:Boolean(diff.full_review_required),
        changed_scene_ids:Array.isArray(diff.changed_scene_ids)?diff.changed_scene_ids:[],
        human_review_required:true,
        publication_authorized:false
      };
      writeJson(statePath,state);
    });
  }else if(!state.stages.review_diff){
    state.stages.review_diff={status:"SKIPPED",reason:"incremental retouch plan required"};
    writeJson(statePath,state);
  }

  stage(state,"human_review_manifest",()=>{
    run(process.execPath,[postRuntime.humanReview,root,humanReview]);
    const review=json(humanReview);
    state.human_review={
      path:humanReview,
      schema:String(review.schema||""),
      decision:String(review.decision||""),
      machine_blocker_count:Array.isArray(review.machine_blockers)?review.machine_blockers.length:0,
      machine_warning_count:Array.isArray(review.machine_warnings)?review.machine_warnings.length:0,
      eligible_for_final_approval:Boolean(review.eligible_for_final_approval),
      human_approved:false,
      publication_authorized:false
    };
    writeJson(statePath,state);
  });

  const registrySpec=resolve(root,"registry-spec.json");
  const registry=resolve(root,"artifact-registry.json");
  stage(state,"registry",()=>{
    const selectedImageEntries=[];
    const selectedData=existsSync(selections)?json(selections):{};
    for(const [sceneId,pick] of Object.entries(selectedData||{})){
      const selectedPath=String(pick?.selected||"").trim();
      if(!selectedPath) continue;
      const absoluteSelected=resolve(selectedPath);
      if(!existsSync(absoluteSelected)) continue;
      selectedImageEntries.push({
        kind:"selected_image",
        path:absoluteSelected,
        metadata:{
          scene_id:sceneId,
          selected_candidate_id:String(pick?.selected_candidate_id||"")||null,
          human_selected:pick?.human_selected===true
        }
      });
    }
    writeJson(registrySpec,{
      schema:"HIBOU_VIDEO_ARTIFACT_REGISTRY_SPEC_V2",
      production_mode:String(storyboardData.production?.mode||"final").toLowerCase()==="preview"?"preview":"final",
      human_review_required:true,
      publication_authorized:false,
      entries:[
      {kind:"storyboard",path:storyboard},
      {kind:"audio",path:mastered},
      {kind:"subtitles",path:ass},
      {kind:"asset_resolved_contract",path:assetResolved},
      {kind:"contract",path:renderReady},
      {kind:"master",path:master},
      {kind:"qc",path:masterQc},
      ...selectedImageEntries,
      ...(creativeQcEnabled&&existsSync(creativeQcReport)?[{kind:"creative_qc",path:creativeQcReport}]:[]),
      ...(existsSync(resolve(imageDir,"candidate-review.json"))?[{kind:"candidate_review",path:resolve(imageDir,"candidate-review.json")}]:[]),
      ...(existsSync(resolve(imageDir,"candidate-review.html"))?[{kind:"candidate_review_html",path:resolve(imageDir,"candidate-review.html")}]:[]),
      ...(existsSync(humanSelectionManifest)?[{kind:"human_selection_manifest",path:humanSelectionManifest}]:[]),
      ...(existsSync(humanReview)?[{kind:"human_review",path:humanReview}]:[]),
      ...(existsSync(reviewDiff)?[{kind:"review_diff",path:reviewDiff}]:[]),
      ...(musicEnabled&&existsSync(mastered+".manifest.json")?[{kind:"audio_mix_manifest",path:mastered+".manifest.json"}]:[]),
      ...(incrementalEnabled&&reuseFromArg&&existsSync(incrementalPlanPath)?[{kind:"incremental_retouch_plan",path:incrementalPlanPath}]:[]),
      {kind:"pipeline_state",path:statePath}
      ]
    });
    run(process.execPath,[postRuntime.registry,registrySpec,registry]);
  });

  const durableStoragePlan=resolve(root,"durable-storage-plan.json");
  stage(state,"durable_storage_plan",()=>{
    run(process.execPath,[
      postRuntime.storagePlan,
      registry,
      durableStoragePlan,
      contentId||String(storyboardData.content?.content_id||""),
      ""
    ]);
    const plan=json(durableStoragePlan);
    state.durable_storage_plan={
      path:durableStoragePlan,
      schema:String(plan.schema||""),
      entry_count:Number(plan.entry_count||0),
      total_size_bytes:Number(plan.total_size_bytes||0),
      upload_performed:false,
      files_moved:false,
      files_deleted:false,
      publication_authorized:false
    };
    writeJson(statePath,state);
  });

  stage(state,"airtable_report",()=>{
    if(!contentId){
      state.stages.airtable_report={status:"SKIPPED",reason:"file storyboard input"};
      state.airtable_report_mode="not_applicable";
      writeJson(statePath,state);
      return;
    }
    if(!reportAirtable){
      state.stages.airtable_report={status:"SKIPPED",reason:"report-airtable disabled; queue worker owns final status"};
      state.airtable_report_mode="dry_run_skipped";
      writeJson(statePath,state);
      return;
    }
    const manifest=master+".manifest.json";
    run(process.execPath,[resolve("scripts/video-airtable-sync.mjs"),"report",contentId,manifest]);
    state.airtable_report_mode="applied";
    writeJson(statePath,state);
  });

  const final={
    ok:true,
    schema:"HIBOU_VIDEO_MASTER_RESULT_V1",
    root,
    master,
    master_qc:masterQc,
    artifact_registry:registry,
    durable_storage_plan:state.durable_storage_plan||null,
    asset_resolution:state.asset_resolution||{enabled:false,full_reuse_scenes:0,generation_required_scenes:0,generation_slots:0},
    qc_status:json(masterQc).status,
    creative_qc_status:state.creative_qc_status||"DISABLED",
    candidate_review:state.candidate_review||null,
    human_review_package:state.human_review||null,
    review_diff:state.review_diff||null,
    image_selection_policy:{
      technical_provisional_selection_allowed:true,
      machine_ranking_is_advisory:true,
      human_candidate_review_required:true,
      publication_authorized:false
    },
    features:{
      video_timeline_v1:timelineEnabled,
      video_prosody_v1:prosodyEnabled,
      video_music_mix_v1:musicEnabled,
      video_creative_qc_v1:creativeQcEnabled,
      video_pose_registry_v1:poseRegistryEnabled,
      video_incremental_retouch_v1:incrementalEnabled,
      video_human_candidate_selection_v1:humanSelectionEnabled
    },
    incremental_retouch:state.incremental_retouch||{enabled:false},
    execution_profile:state.execution_profile||null,
    production_mode:String(storyboardData.production?.mode||"final").toLowerCase()==="preview"?"preview":"final",
    preview_only:String(storyboardData.production?.mode||"final").toLowerCase()==="preview",
    airtable_report_mode:contentId?(reportAirtable?"applied":"dry_run"):"not_applicable",
    human_master_review_required:true,
    publication_authorized:false
  };
  writeJson(masterResultPath,final);
  process.stdout.write(JSON.stringify(final,null,2)+"\n");
}
if(import.meta.url===pathToFileURL(resolve(process.argv[1])).href) main().catch(error=>{console.error(String(error?.stack||error));process.exitCode=1;});
