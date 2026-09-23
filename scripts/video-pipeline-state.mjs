#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
function json(path){try{return JSON.parse(readFileSync(path,"utf8"));}catch{return null;}}
function selectionsComplete(path,sceneCount){
 const d=json(path); if(!d) return false; const vals=Object.values(d); return vals.length>=sceneCount&&vals.every(x=>x?.selected);
}
export function inspectPipeline(rootArg){
 const root=resolve(rootArg);
 const p=n=>resolve(root,n);
 const storyboard=json(p("storyboard.json"));
 const audioReady=json(p("voice/contract-audio-ready.json"));
 const mastered=json(p("voice/contract-mastered.json"));
 const imagePlan=json(p("images/image-plan.json"));
 const imageBatch=json(p("images/batch-manifest.json"));
 const sceneCount=storyboard?.scenes?.length||0;
 const candidatesReady=sceneCount>0&&imageBatch&&Object.values(imageBatch.results||{}).filter(x=>x.status==="completed").length>=sceneCount*3;
 const imageQc=json(p("images/image-qc.json"));
 const selected=selectionsComplete(p("images/selections.json"),sceneCount);
 const renderReady=json(p("render-ready.json"));
 const masterExists=existsSync(p("master.mp4"));
 const qc=json(p("master-qc.json"));
 let gate,next;
 if(!storyboard){gate="EXPORT_REQUIRED";next="export Airtable storyboard to storyboard.json";}
 else if(!audioReady){gate="VOICE_REQUIRED";next="run Chatterbox batch";}
 else if(!mastered){gate="AUDIO_MASTER_REQUIRED";next="master audio, then attach mastered audio";}
 else if(!existsSync(p("subtitles.ass"))){gate="SUBTITLES_REQUIRED";next="generate ASS subtitles from mastered contract";}
 else if(!imagePlan){gate="IMAGE_PLAN_REQUIRED";next="build image plan from real ComfyUI binding";}
 else if(!candidatesReady){gate="IMAGE_GENERATION_REQUIRED";next="run resumable image batch";}
 else if(!imageQc){gate="IMAGE_TECHNICAL_QC_REQUIRED";next="run deterministic image QC before human selection";}
 else if(imageQc.all_scenes_have_candidate!==true){gate="IMAGE_REGENERATION_REQUIRED";next="regenerate only scenes with zero technically valid candidate";}
 else if(!selected){gate="HUMAN_IMAGE_SELECTION";next="select one of 3 candidates for every scene";}
 else if(!renderReady){gate="PROMOTION_REQUIRED";next="promote storyboard + selections to render-ready";}
 else if(!masterExists){gate="RENDER_REQUIRED";next="render MP4";}
 else if(!qc){gate="TECHNICAL_QC_REQUIRED";next="run master QC";}
 else {gate=qc.status==="PASS"?"HUMAN_EDITORIAL_REVIEW":"TECHNICAL_REVIEW";next=qc.status==="PASS"?"review final video; publication remains locked":"fix QC findings then rerender";}
 return {schema:"HIBOU_PIPELINE_STATE_V2",root,scene_count:sceneCount,gate,next,artifacts:{
   storyboard:!!storyboard,audio_ready:!!audioReady,audio_mastered:!!mastered,subtitles:existsSync(p("subtitles.ass")),
   image_plan:!!imagePlan,image_candidates_ready:Boolean(candidatesReady),image_technical_qc:imageQc?.all_scenes_have_candidate??null,human_images_selected:Boolean(selected),
   render_ready:!!renderReady,master:masterExists,qc:qc?.status||null
 },publication_authorized:false};
}
if(import.meta.url===`file://${process.argv[1]}`){
 const [root="."]=process.argv.slice(2); process.stdout.write(JSON.stringify(inspectPipeline(root),null,2)+"\n");
}
