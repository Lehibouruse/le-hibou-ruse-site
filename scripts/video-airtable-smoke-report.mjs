#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { TABLES, updateRecord } from "../lib/airtable.js";

function json(path){ try{return JSON.parse(readFileSync(path,"utf8"));}catch{return null;} }
function fail(message){ throw new Error(message); }

export function summarizeSmoke(rootArg){
  const root=resolve(rootArg);
  const prep=json(resolve(root,"smoke-prep.json"));
  if(!prep) fail("smoke-prep.json missing");
  const storyboard=json(prep.storyboard);
  const voice=json(resolve(root,"voice","voice-batch-manifest.json"));
  const images=json(resolve(root,"images","batch-manifest.json"));
  const imageResults=Object.values(images?.results||{});
  const completedImages=imageResults.filter(x=>x.status==="completed").length;
  const imageErrors=imageResults.filter(x=>x.status==="error").length;
  const voiceReady=Boolean(voice?.master && voice?.master_sha256 && Number(voice?.duration_s)>0);
  const imagesReady=completedImages>=3 && imageErrors===0;
  const status=voiceReady&&imagesReady?"SMOKE_PASS":voiceReady||completedImages>0?"SMOKE_PARTIAL":"SMOKE_PREPARED";
  return {
    schema:"HIBOU_ONE_SCENE_SMOKE_RESULT_V1",
    status,
    content_id:storyboard?.content?.content_id||null,
    scene_id:prep.scene_id,
    source_scene_order:prep.source_scene_order,
    voice:{
      ready:voiceReady,
      duration_s:voice?.duration_s??null,
      sha256:voice?.master_sha256||null,
      cache_hits:voice?.scene_cache_hits??null,
      cache_misses:voice?.scene_cache_misses??null
    },
    images:{ready:imagesReady,completed:completedImages,errors:imageErrors,required:3},
    publication_authorized:false,
    full_pipeline_completed:false
  };
}

export function airtableSmokeFields(summary){
  const evidence=[
    "smoke_status="+summary.status,
    "scene_id="+(summary.scene_id||""),
    "voice_ready="+summary.voice.ready,
    "images="+summary.images.completed+"/"+summary.images.required
  ];
  if(summary.voice.sha256) evidence.push("voice_sha256="+summary.voice.sha256);
  return {
    content:{
      "État production vidéo":summary.status==="SMOKE_PASS"
        ?"LOCAL_SMOKE_PASS — FULL_PIPELINE_NOT_RUN"
        :"LOCAL_SMOKE_PARTIAL",
      "Assets":JSON.stringify(summary,null,2),
      "Erreur pipeline":summary.images.errors?"Smoke image errors: "+summary.images.errors:""
    },
    scene:{
      "Motif QC":evidence.join("; ")+"; publication locked; full pilot not run",
      "Erreur":summary.images.errors?"Smoke image errors: "+summary.images.errors:""
    }
  };
}

async function apply(summary,rootArg){
  if(!summary.content_id) fail("content_id missing");
  const fields=airtableSmokeFields(summary);
  await updateRecord(TABLES.content,summary.content_id,fields.content);
  const contract=json(resolve(rootArg,"storyboard-one-scene.json"));
  const sceneRecordId=contract?.scenes?.[0]?.source_scene_record_id;
  if(sceneRecordId) await updateRecord(TABLES.videoScenes,sceneRecordId,fields.scene);
  return {content_id:summary.content_id,scene_record_id:sceneRecordId||null,applied:true};
}

if(import.meta.url===`file://${process.argv[1]}`){
  const [command,root,...rest]=process.argv.slice(2);
  if(command!=="summarize"&&command!=="report") {
    fail("usage: video-airtable-smoke-report.mjs summarize|report <smoke-output-dir> [--apply]");
  }
  if(!root) fail("smoke output directory required");
  const summary=summarizeSmoke(root);
  if(command==="summarize"){
    process.stdout.write(JSON.stringify(summary,null,2)+"\n");
  }else{
    const doApply=rest.includes("--apply");
    const result=doApply
      ?await apply(summary,root)
      :{...airtableSmokeFields(summary),applied:false,summary};
    process.stdout.write(JSON.stringify(result,null,2)+"\n");
  }
}
