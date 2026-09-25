#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

function fail(message){ throw new Error(message); }
function sha256(path){ return createHash("sha256").update(readFileSync(path)).digest("hex"); }
function json(path){ return JSON.parse(readFileSync(resolve(path),"utf8")); }
function writeJson(path,value){ mkdirSync(dirname(resolve(path)),{recursive:true}); writeFileSync(resolve(path),JSON.stringify(value,null,2)+"\n"); }
function run(command,args,{env={}}={}){
  const r=spawnSync(command,args,{stdio:"inherit",windowsHide:true,shell:false,env:{...process.env,...env}});
  if(r.status!==0) fail(command+" failed with status "+r.status);
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
function skipStage(state,name,reason){
  state.stages[name]={status:"SKIPPED",reason,finished_at:new Date().toISOString()};
  writeJson(state.path,state);
}
function stage(state,name,fn){
  if(["PASS","SKIPPED"].includes(state.stages[name]?.status)) return false;
  state.stages[name]={status:"RUNNING",started_at:new Date().toISOString()};
  writeJson(state.path,state);
  try{
    fn();
    state.stages[name]={status:"PASS",finished_at:new Date().toISOString()};
    writeJson(state.path,state);
    return true;
  }catch(error){
    state.stages[name]={status:"ERROR",finished_at:new Date().toISOString(),error:String(error?.message||error).slice(0,2000)};
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
  const maxScenes=Number(arg("max-scenes","20"));
  const regenAttempts=Number(arg("regen-attempts","1"));
  const reportAirtable=flag("report-airtable");
  const planOnly=flag("plan-only");
  if(!outputArg) fail("--output=<dir> required");
  if(!bindingArg) fail("--binding=<comfyui-binding.json> required");
  if(Boolean(contentId)===Boolean(storyboardArg)) fail("provide exactly one of --content=<Airtable record> or --storyboard=<json>");
  if(!existsSync(resolve(bindingArg))) fail("binding file missing");
  if(styleArg&&!existsSync(resolve(styleArg))) fail("style profile missing");

  const policy=masterPolicy({maxScenes,regenAttempts});
  const root=resolve(outputArg);
  mkdirSync(root,{recursive:true});
  const storyboard=resolve(root,"storyboard.json");
  const statePath=resolve(root,"pipeline-run.json");
  const inputs={
    source:contentId?{type:"airtable",content_id:contentId}:{type:"file",path:resolve(storyboardArg),sha256:sha256(resolve(storyboardArg))},
    binding:{path:resolve(bindingArg),sha256:sha256(resolve(bindingArg))},
    style:styleArg?{path:resolve(styleArg),sha256:sha256(resolve(styleArg))}:null,
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
      "storyboard","voice","audio_master","voice_qc","subtitles","style","images","technical_selection","promotion","render","master_qc","forensic_quality","registry","airtable_report"
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

  const voiceDir=resolve(root,"voice");
  const voiceReady=resolve(voiceDir,"contract-audio-ready.json");
  const rawVoice=resolve(voiceDir,"voice-master.wav");
  stage(state,"voice",()=>{
    const py=pythonCommand();
    run(py.cmd,[...py.prefix,resolve("scripts/chatterbox-storyboard-batch.py"),storyboard,voiceDir]);
    if(!existsSync(voiceReady)||!existsSync(rawVoice)) fail("voice outputs missing");
  });

  const mastered=resolve(voiceDir,"voice-mastered.wav");
  const masteredContract=resolve(root,"contract-mastered.json");
  stage(state,"audio_master",()=>{
    run(process.execPath,[resolve("scripts/video-audio-master.mjs"),rawVoice,mastered]);
    run(process.execPath,[resolve("scripts/video-attach-mastered-audio.mjs"),voiceReady,mastered,masteredContract]);
  });

  const voiceQc=resolve(voiceDir,"voice-qc.json");
  if(String(process.env.HIBOU_FORENSIC_PYTHON||"").trim()){
    stage(state,"voice_qc",()=>{
      run(process.execPath,[resolve("scripts/video-voice-qc-run.mjs"),masteredContract,mastered,voiceDir],{
        env:{HIBOU_FORENSIC_PYTHON:process.env.HIBOU_FORENSIC_PYTHON}
      });
      const qc=json(voiceQc);
      state.voice_qc_status=qc.status;
      state.voice_qc_overall_wer=qc.overall_wer;
      writeJson(statePath,state);
      if(qc.status!=="PASS") fail("voice QC requires REVIEW before image generation");
    });
  }else if(!state.stages.voice_qc){
    skipStage(state,"voice_qc","HIBOU_FORENSIC_PYTHON not configured; human voice review remains required");
    state.voice_qc_status="NOT_RUN";
    writeJson(statePath,state);
  }

  const ass=resolve(root,"subtitles.ass");
  const captioned=resolve(root,"contract-captioned.json");
  stage(state,"subtitles",()=>{
    run(process.execPath,[resolve("scripts/video-subtitles.mjs"),masteredContract,ass]);
    run(process.execPath,[resolve("scripts/video-attach-subtitles.mjs"),masteredContract,ass,captioned]);
  });

  const styled=resolve(root,"contract-styled.json");
  stage(state,"style",()=>{
    if(styleArg) run(process.execPath,[resolve("scripts/video-style-apply.mjs"),captioned,resolve(styleArg),styled]);
    else writeJson(styled,json(captioned));
  });

  const imageDir=resolve(root,"images");
  stage(state,"images",()=>{
    run(process.execPath,[
      resolve("scripts/video-image-factory.mjs"),
      storyboard,resolve(bindingArg),imageDir,
      "--max-scenes="+policy.max_scenes,
      "--regen-attempts="+policy.regeneration_attempts
    ]);
    const result=json(resolve(imageDir,"factory-run.json"));
    if(result.all_scenes_have_candidate!==true) fail("one or more scenes still have no QC PASS candidate");
  });

  const selections=resolve(imageDir,"selections.json");
  stage(state,"technical_selection",()=>{
    const provisional=json(resolve(imageDir,"selections.provisional.json"));
    writeJson(selections,buildTechnicalSelections(provisional));
  });

  const renderReady=resolve(root,"render-ready.json");
  stage(state,"promotion",()=>{
    run(process.execPath,[resolve("scripts/video-storyboard-promote.mjs"),styled,selections,renderReady]);
  });

  const master=resolve(root,"master.mp4");
  stage(state,"render",()=>{
    run(process.execPath,[resolve("scripts/video-local-render.mjs"),renderReady,master]);
  });

  const masterQc=resolve(root,"master-qc.json");
  stage(state,"master_qc",()=>{
    run(process.execPath,[resolve("scripts/video-master-qc.mjs"),master,masterQc]);
    const qc=json(masterQc);
    if(!["PASS","REVIEW"].includes(qc.status)) fail("unexpected master QC status");
    state.master_qc_status=qc.status;
    state.publication_authorized=false;
    writeJson(statePath,state);
  });

  const forensicDir=resolve(root,"forensic");
  const forensicManifest=resolve(forensicDir,"manifest.json");
  const qualityProximity=resolve(root,"quality-proximity.json");
  if(styleArg){
    stage(state,"forensic_quality",()=>{
      run(process.execPath,[resolve("scripts/forensic-package-local.mjs"),master,forensicDir],{
        env:{HIBOU_FORENSIC_PYTHON:String(process.env.HIBOU_FORENSIC_PYTHON||"")}
      });
      run(process.execPath,[resolve("scripts/video-quality-proximity.mjs"),resolve(styleArg),forensicManifest,qualityProximity]);
      const report=json(qualityProximity);
      state.quality_proximity_score=report.overall_score;
      state.quality_proximity_coverage=report.coverage?.ratio ?? null;
      writeJson(statePath,state);
    });
  }else if(!state.stages.forensic_quality){
    skipStage(state,"forensic_quality","no --style profile supplied");
  }

  const registrySpec=resolve(root,"registry-spec.json");
  const registry=resolve(root,"artifact-registry.json");
  stage(state,"registry",()=>{
    const entries=[
      {kind:"storyboard",path:storyboard},
      {kind:"audio",path:mastered},
      {kind:"subtitles",path:ass},
      {kind:"contract",path:renderReady},
      {kind:"master",path:master},
      {kind:"qc",path:masterQc},
      {kind:"pipeline_state",path:statePath}
    ];
    if(existsSync(voiceQc)) entries.push({kind:"voice_qc",path:voiceQc});
    if(existsSync(forensicManifest)) entries.push({kind:"forensic_manifest",path:forensicManifest});
    if(existsSync(qualityProximity)) entries.push({kind:"quality_proximity",path:qualityProximity});
    writeJson(registrySpec,{entries});
    run(process.execPath,[resolve("scripts/video-artifact-registry.mjs"),registrySpec,registry]);
  });

  stage(state,"airtable_report",()=>{
    if(!contentId){
      state.stages.airtable_report={status:"SKIPPED",reason:"file storyboard input"};
      writeJson(statePath,state);
      return;
    }
    const manifest=master+".manifest.json";
    run(process.execPath,[resolve("scripts/video-airtable-sync.mjs"),"report",contentId,manifest,...(reportAirtable?[]:["--dry-run"])]);
    state.airtable_report_mode=reportAirtable?"applied":"dry_run";
    writeJson(statePath,state);
  });

  const final={
    ok:true,
    schema:"HIBOU_VIDEO_MASTER_RESULT_V1",
    root,
    master,
    master_qc:masterQc,
    artifact_registry:registry,
    qc_status:json(masterQc).status,
    voice_qc_status:state.voice_qc_status||"NOT_RUN",
    voice_qc_overall_wer:state.voice_qc_overall_wer??null,
    quality_proximity_score:state.quality_proximity_score??null,
    quality_proximity_coverage:state.quality_proximity_coverage??null,
    airtable_report_mode:contentId?(reportAirtable?"applied":"dry_run"):"not_applicable",
    human_master_review_required:true,
    publication_authorized:false
  };
  writeJson(resolve(root,"master-result.json"),final);
  process.stdout.write(JSON.stringify(final,null,2)+"\n");
}
if(import.meta.url===`file://${process.argv[1]}`) main().catch(error=>{console.error(String(error?.stack||error));process.exitCode=1;});
