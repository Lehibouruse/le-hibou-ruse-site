#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

function fail(message){ throw new Error(message); }
function sha256(path){ return createHash("sha256").update(readFileSync(path)).digest("hex"); }
function json(path){ return JSON.parse(readFileSync(resolve(path),"utf8")); }
function writeJson(path,value){ mkdirSync(dirname(resolve(path)),{recursive:true}); writeFileSync(resolve(path),JSON.stringify(value,null,2)+"\n"); }
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
  ["video-attach-mastered-audio.mjs","attachMasteredAudio"],
  ["video-subtitles.mjs","buildAss"],
  ["video-attach-subtitles.mjs","attachSubtitles"],
  ["video-style-apply.mjs","applyStyleProfile"],
  ["video-asset-resolve.mjs","applyAssetResolution"],
  ["video-asset-graph.mjs","planSceneAssetReuse"]
];

async function ensurePreImageRuntimeBundle(commit){
  const normalized=String(commit||"").trim().toLowerCase();
  if(!/^[0-9a-f]{40}$/.test(normalized)) fail("storyboard runtime_commit missing or invalid");
  const localBase=resolve(
    process.env.LOCALAPPDATA||dirname(resolve(process.argv[1])),
    "LeHibou","pre-image-runtime",normalized
  );
  mkdirSync(localBase,{recursive:true});
  for(const [name,marker] of PRE_IMAGE_RUNTIME_FILES){
    const target=resolve(localBase,name);
    let source=existsSync(target)?readFileSync(target,"utf8"):"";
    if(!source.includes(marker)){
      const url=`https://raw.githubusercontent.com/Lehibouruse/le-hibou-ruse-site/${normalized}/scripts/${name}`;
      const response=await fetch(url,{headers:{"User-Agent":"Le-Hibou-Video-Master/1.0","Cache-Control":"no-cache",Pragma:"no-cache"}});
      if(!response.ok) fail(`pre-image runtime download failed HTTP ${response.status}: ${name}@${normalized}`);
      source=await response.text();
      if(!source.includes(marker)) fail(`pre-image runtime marker missing: ${name}@${normalized}`);
      writeFileSync(target,source,"utf8");
    }
  }
  return {
    audioMaster:resolve(localBase,"video-audio-master.mjs"),
    attachAudio:resolve(localBase,"video-attach-mastered-audio.mjs"),
    subtitles:resolve(localBase,"video-subtitles.mjs"),
    attachSubtitles:resolve(localBase,"video-attach-subtitles.mjs"),
    style:resolve(localBase,"video-style-apply.mjs"),
    assetResolve:resolve(localBase,"video-asset-resolve.mjs")
  };
}

const IMAGE_RUNTIME_FILES=[
  ["video-image-factory.mjs","executeImagePlan","scripts/video-image-factory.mjs"],
  ["video-image-batch.mjs","runImageGen","scripts/video-image-batch.mjs"],
  ["video-local-adapters.mjs","ComfyUI /prompt returned no prompt_id","scripts/video-local-adapters.mjs"],
  ["video-image-plan.mjs","HIBOU_IMAGE_PLAN_V1","scripts/video-image-plan.mjs"],
  ["video-image-qc.mjs","HIBOU_IMAGE_BATCH_V1","scripts/video-image-qc.mjs"],
  ["video-image-regenerate.mjs","buildTargetedRegeneration","scripts/video-image-regenerate.mjs"],
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
  ["video-artifact-registry.mjs","HIBOU_VIDEO_ARTIFACT_REGISTRY_V1"]
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
    registry:resolve(localBase,"video-artifact-registry.mjs")
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
  state.stages[name]={status:"RUNNING",started_at:new Date().toISOString()};
  writeJson(state.path,state);
  try{
    fn();
    state.stages[name]={status:"PASS",finished_at:new Date().toISOString()};
    writeJson(state.path,state);
    return true;
  }catch(error){
    const fullError=String(error?.stack||error?.message||error);
    const head=fullError.slice(0,1200);
    const tail=fullError.length>1200?fullError.slice(-6800):"";
    state.stages[name]={
      status:"ERROR",
      finished_at:new Date().toISOString(),
      error:tail?head+"\n--- error tail ---\n"+tail:head
    };
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
  const root=resolve(outputArg);
  mkdirSync(root,{recursive:true});
  const storyboard=resolve(root,"storyboard.json");
  const statePath=resolve(root,"pipeline-run.json");
  const inputs={
    source:contentId?{type:"airtable",content_id:contentId}:{type:"file",path:resolve(storyboardArg),sha256:sha256(resolve(storyboardArg))},
    binding:{path:resolve(bindingArg),sha256:sha256(resolve(bindingArg))},
    style:styleArg?{path:resolve(styleArg),sha256:sha256(resolve(styleArg))}:null,
    asset_graph:assetGraphArg?{path:resolve(assetGraphArg),sha256:sha256(resolve(assetGraphArg))}:null,
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
      "storyboard","voice","audio_master","subtitles","style","asset_resolution","images","technical_selection","promotion","render","master_qc","registry","airtable_report"
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

  const runtimeCommit=String(json(storyboard).runtime_commit||"").trim();
  const preRuntime=await ensurePreImageRuntimeBundle(runtimeCommit);

  const voiceDir=resolve(root,"voice");
  const voiceReady=resolve(voiceDir,"contract-audio-ready.json");
  const rawVoice=resolve(voiceDir,"voice-master.wav");
  stage(state,"voice",()=>{
    const py=pythonCommand();
    const voiceScript=chatterboxBatchScript();
    if(!existsSync(voiceScript)) fail("chatterbox batch script missing: "+voiceScript);
    run(py.cmd,[...py.prefix,voiceScript,storyboard,voiceDir]);
    if(!existsSync(voiceReady)||!existsSync(rawVoice)) fail("voice outputs missing");
  });

  const mastered=resolve(voiceDir,"voice-mastered.wav");
  const masteredContract=resolve(root,"contract-mastered.json");
  stage(state,"audio_master",()=>{
    run(process.execPath,[preRuntime.audioMaster,rawVoice,mastered]);
    run(process.execPath,[preRuntime.attachAudio,voiceReady,mastered,masteredContract]);
  });

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

  const assetResolved=resolve(root,"contract-assets-resolved.json");
  stage(state,"asset_resolution",()=>{
    if(assetGraphArg){
      run(process.execPath,[preRuntime.assetResolve,styled,resolve(assetGraphArg),assetResolved]);
    }else{
      writeJson(assetResolved,json(styled));
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
    if(result.all_scenes_have_candidate!==true){
      const diagnostic={
        technical_qc:result.technical_qc||null,
        perceptual_qc:result.perceptual_qc||null
      };
      fail("one or more scenes still have no QC PASS candidate; diagnostics="+JSON.stringify(diagnostic));
    }
  });

  const selections=resolve(imageDir,"selections.json");
  stage(state,"technical_selection",()=>{
    const provisional=json(resolve(imageDir,"selections.provisional.json"));
    if(Object.keys(provisional||{}).length===0){
      writeJson(selections,{});
    }else{
      writeJson(selections,buildTechnicalSelections(provisional));
    }
  });

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

  const registrySpec=resolve(root,"registry-spec.json");
  const registry=resolve(root,"artifact-registry.json");
  stage(state,"registry",()=>{
    writeJson(registrySpec,{entries:[
      {kind:"storyboard",path:storyboard},
      {kind:"audio",path:mastered},
      {kind:"subtitles",path:ass},
      {kind:"asset_resolved_contract",path:assetResolved},
      {kind:"contract",path:renderReady},
      {kind:"master",path:master},
      {kind:"qc",path:masterQc},
      {kind:"pipeline_state",path:statePath}
    ]});
    run(process.execPath,[postRuntime.registry,registrySpec,registry]);
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
    asset_resolution:state.asset_resolution||{enabled:false,full_reuse_scenes:0,generation_required_scenes:0,generation_slots:0},
    qc_status:json(masterQc).status,
    airtable_report_mode:contentId?(reportAirtable?"applied":"dry_run"):"not_applicable",
    human_master_review_required:true,
    publication_authorized:false
  };
  writeJson(resolve(root,"master-result.json"),final);
  process.stdout.write(JSON.stringify(final,null,2)+"\n");
}
if(import.meta.url===pathToFileURL(resolve(process.argv[1])).href) main().catch(error=>{console.error(String(error?.stack||error));process.exitCode=1;});
