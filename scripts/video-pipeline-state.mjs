#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

function json(path){
  try{return JSON.parse(readFileSync(path,"utf8"));}catch{return null;}
}

function lastRunPointerPath(){
  const base=String(process.env.LOCALAPPDATA||process.env.HOME||".").trim()||".";
  return resolve(base,"LeHibou","last-video-run.json");
}

export function resolvePipelineRoot(rootArg=""){
  const explicit=String(rootArg||"").trim();
  if(explicit) return resolve(explicit);
  const pointer=json(lastRunPointerPath());
  if(pointer?.schema==="HIBOU_LAST_VIDEO_RUN_V1"&&pointer?.root){
    return resolve(pointer.root);
  }
  return resolve(".");
}

function selectionsComplete(path,sceneCount){
  const d=json(path);
  if(!d) return false;
  const vals=Object.values(d);
  return vals.length>=sceneCount&&vals.every(x=>x?.selected);
}

function latestStageError(run){
  const errors=Object.entries(run?.stages||{})
    .filter(([,value])=>value?.status==="ERROR")
    .map(([name,value])=>({stage:name,error:String(value?.error||"").trim(),finished_at:value?.finished_at||null}));
  return errors.at(-1)||null;
}

function completedRequests(imagePlan,imageBatch){
  const requests=Array.isArray(imagePlan?.requests)?imagePlan.requests:[];
  const results=imageBatch?.results||{};
  if(requests.length){
    return {
      expected:requests.length,
      completed:requests.filter(req=>results?.[req.candidate_id]?.status==="completed").length,
      ready:requests.every(req=>results?.[req.candidate_id]?.status==="completed")
    };
  }
  const sceneCount=Number(imagePlan?.scene_count||0);
  const reused=Array.isArray(imagePlan?.skipped_full_reuse)?imagePlan.skipped_full_reuse.length:0;
  return {expected:0,completed:0,ready:sceneCount>0&&reused>=sceneCount};
}

export function inspectPipeline(rootArg=""){
  const root=resolvePipelineRoot(rootArg);
  const p=name=>resolve(root,name);
  const run=json(p("pipeline-run.json"));
  const storyboard=json(p("storyboard.json"));
  const audioReady=json(p("voice/contract-audio-ready.json"));
  const mastered=json(p("voice/contract-mastered.json"));
  const imagePlan=json(p("images/image-plan.json"));
  const imageBatch=json(p("images/batch-manifest.json"));
  const imageQc=json(p("images/image-perceptual-qc.json"))||json(p("images/image-qc.json"));
  const sceneCount=storyboard?.scenes?.length||0;
  const candidateState=completedRequests(imagePlan,imageBatch);
  const selected=selectionsComplete(p("images/selections.json"),sceneCount)||
    run?.stages?.technical_selection?.status==="PASS";
  const renderReady=json(p("render-ready.json"));
  const masterExists=existsSync(p("master.mp4"));
  const qc=json(p("master-qc.json"));
  const creativeQc=json(p("creative-qc.json"));
  const masterSemanticQc=json(p("master-semantic-qc.json"));
  const promptVerdict=json(p("prompt-contract-verdict.json"));
  const stageError=latestStageError(run);

  let gate,next;
  if(stageError){
    gate="PIPELINE_ERROR";
    next=`${stageError.stage}: ${stageError.error||"inspect pipeline-run.json"}`;
  }else if(!storyboard){
    gate="EXPORT_REQUIRED";
    next=String(process.env.AIRTABLE_TOKEN||"").trim()
      ?"export Airtable storyboard to storyboard.json"
      :"load AIRTABLE_TOKEN, then export Airtable storyboard";
  }else if(!audioReady){
    gate="VOICE_REQUIRED"; next="run Chatterbox batch";
  }else if(!mastered){
    gate="AUDIO_MASTER_REQUIRED"; next="master audio, then attach mastered audio";
  }else if(!existsSync(p("subtitles.ass"))){
    gate="SUBTITLES_REQUIRED"; next="generate ASS subtitles from mastered contract";
  }else if(!imagePlan){
    gate="IMAGE_PLAN_REQUIRED"; next="build image plan from real ComfyUI binding";
  }else if(!candidateState.ready){
    gate="IMAGE_GENERATION_REQUIRED";
    next=`run resumable image batch (${candidateState.completed}/${candidateState.expected} effective requests complete)`;
  }else if(!imageQc){
    gate="IMAGE_TECHNICAL_QC_REQUIRED"; next="run deterministic/perceptual image QC before selection";
  }else if(imageQc.all_scenes_have_candidate!==true){
    gate="IMAGE_REGENERATION_REQUIRED"; next="regenerate only scenes with zero valid candidate";
  }else if(!selected){
    gate="HUMAN_IMAGE_SELECTION"; next="select/approve one valid candidate for every scene";
  }else if(!renderReady){
    gate="PROMOTION_REQUIRED"; next="promote storyboard + selections to render-ready";
  }else if(!masterExists){
    gate="RENDER_REQUIRED"; next="render MP4";
  }else if(!qc){
    gate="TECHNICAL_QC_REQUIRED"; next="run master QC";
  }else if(qc.status!=="PASS"){
    gate="TECHNICAL_REVIEW"; next="fix master QC findings then rerender";
  }else if(creativeQc&&creativeQc.status!=="PASS"){
    gate="CREATIVE_REVIEW"; next="fix source-image creative QC findings before approval";
  }else if(masterSemanticQc&&masterSemanticQc.status!=="PASS"){
    gate="MASTER_SEMANTIC_REVIEW"; next="fix crop/compositing/final-frame semantic losses before approval";
  }else if(promptVerdict?.PROMPT_CONTRACT_PASS===false){
    gate="PROMPT_CONTRACT_REVIEW"; next="resolve failed prompt execution/semantic/human-review checks";
  }else{
    gate="HUMAN_EDITORIAL_REVIEW"; next="review final video; publication remains locked";
  }

  return {
    schema:"HIBOU_PIPELINE_STATE_V3",
    root,
    scene_count:sceneCount,
    gate,
    next,
    environment:{
      airtable_token_loaded:Boolean(String(process.env.AIRTABLE_TOKEN||"").trim())
    },
    run:{
      schema:run?.schema||null,
      created_at:run?.created_at||null,
      pipeline_status:run?.pipeline_status||null,
      last_error_stage:stageError?.stage||null,
      last_error:stageError?.error||null
    },
    image_generation:{
      expected_requests:candidateState.expected,
      completed_requests:candidateState.completed,
      ready:Boolean(candidateState.ready),
      candidates_per_scene:Number(imagePlan?.candidates_per_scene||
        storyboard?.production?.candidates_per_scene||
        storyboard?.production?.final_candidates_per_scene||
        storyboard?.creative?.production_defaults?.candidates_per_scene||0)||null,
      cache_hits:Number(imageBatch?.cache_hits||0),
      cache_invalidations:Number(imageBatch?.cache_invalidations||0)
    },
    artifacts:{
      storyboard:!!storyboard,
      audio_ready:!!audioReady,
      audio_mastered:!!mastered,
      subtitles:existsSync(p("subtitles.ass")),
      image_plan:!!imagePlan,
      image_candidates_ready:Boolean(candidateState.ready),
      image_technical_qc:imageQc?.all_scenes_have_candidate??null,
      human_images_selected:Boolean(selected),
      render_ready:!!renderReady,
      master:masterExists,
      qc:qc?.status||null,
      creative_qc:creativeQc?.status||null,
      master_semantic_qc:masterSemanticQc?.status||null,
      prompt_contract_pass:promptVerdict?.PROMPT_CONTRACT_PASS??null
    },
    publication_authorized:false
  };
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const rootArg=process.argv.slice(2)[0]||"";
  process.stdout.write(JSON.stringify(inspectPipeline(rootArg),null,2)+"\n");
}
