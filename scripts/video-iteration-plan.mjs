#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const ITERATION_PLAN_SCHEMA="HIBOU_INCREMENTAL_RETOUCH_PLAN_V1";

function fail(message){ throw new Error(message); }
function clone(value){ return structuredClone(value); }

function stable(value){
  if(Array.isArray(value)) return value.map(stable);
  if(value && typeof value==="object"){
    return Object.fromEntries(
      Object.keys(value).sort().map(key=>[key,stable(value[key])])
    );
  }
  return value;
}

function fingerprint(value){
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function text(value){ return String(value??"").trim(); }

function sceneDomains(scene){
  return {
    timing:fingerprint({
      order:Number(scene?.order||0),
      planned_duration_s:Number(scene?.planned_duration_s||0)
    }),
    voice:fingerprint({
      narration_exact:scene?.narration_exact||null,
      breath_unit:text(scene?.breath_unit),
      voice:scene?.voice||null
    }),
    image:fingerprint({
      visual_idea:text(scene?.visual_idea),
      image_prompt:text(scene?.image_prompt),
      framing:scene?.framing||null,
      asset_requirements:scene?.asset_requirements||[],
      pose_request:text(scene?.pose_request)
    }),
    composition:fingerprint({
      composition:scene?.composition||null,
      timeline:scene?.timeline||null,
      zoom_percent:scene?.zoom_percent??null,
      music_cue:scene?.music_cue??null
    }),
    captions:fingerprint({
      screen_text:text(scene?.screen_text)
    })
  };
}

function globalDomains(contract){
  const creative=contract?.creative||{};
  return {
    style:fingerprint({
      style_lock:creative.style_lock||null,
      negative_prompt:creative.negative_prompt||null,
      character_lock:creative.character_lock||null,
      reference_mode:creative.reference_mode||null,
      reference_image_url:creative.reference_image_url||null,
      reference_asset_repo_path:creative.reference_asset_repo_path||null,
      content_brief:creative.content_brief||null
    }),
    branding:fingerprint(creative.branding||null),
    music:fingerprint(contract?.music||null),
    engine:fingerprint(contract?.engine||null),
    features:fingerprint(contract?.features||null),
    production:fingerprint(contract?.production||null)
  };
}

function sceneId(scene,index){
  return text(scene?.scene_id)||`__index_${index+1}`;
}

function addAll(set,values){ for(const value of values) set.add(value); }

export function buildIterationPlan(previousContract,nextContract){
  for(const [label,contract] of [["previous",previousContract],["next",nextContract]]){
    if(contract?.contract_version!=="HIBOU_VIDEO_CONTRACT_V1") fail(`${label} contract version unsupported`);
  }
  const previousContent=text(previousContract?.content?.content_id);
  const nextContent=text(nextContract?.content?.content_id);
  if(previousContent && nextContent && previousContent!==nextContent) fail("incremental retouch requires the same content_id");

  const previousScenes=new Map((previousContract.scenes||[]).map((scene,index)=>[sceneId(scene,index),scene]));
  const nextScenes=new Map((nextContract.scenes||[]).map((scene,index)=>[sceneId(scene,index),scene]));
  const previousIds=[...previousScenes.keys()];
  const nextIds=[...nextScenes.keys()];
  const structuralChange=
    previousIds.length!==nextIds.length ||
    previousIds.some((id,index)=>id!==nextIds[index]);

  const invalidatedStages=new Set();
  const invalidatedSceneIds={
    voice:new Set(),
    images:new Set(),
    creative_qc:new Set(),
    render:new Set()
  };

  const prevGlobal=globalDomains(previousContract);
  const nextGlobal=globalDomains(nextContract);
  const globalChanges=Object.keys(prevGlobal).filter(key=>prevGlobal[key]!==nextGlobal[key]);

  if(globalChanges.includes("style")){
    addAll(invalidatedStages,["images","creative_qc","promotion","render","master_qc","registry"]);
    addAll(invalidatedSceneIds.images,nextIds);
    addAll(invalidatedSceneIds.creative_qc,nextIds);
    addAll(invalidatedSceneIds.render,nextIds);
  }
  if(globalChanges.includes("branding")){
    addAll(invalidatedStages,["promotion","render","master_qc","registry"]);
    addAll(invalidatedSceneIds.render,nextIds);
  }
  if(globalChanges.includes("music")){
    addAll(invalidatedStages,["music_mix","audio_attach","render","master_qc","registry"]);
  }
  if(globalChanges.includes("engine")){
    addAll(invalidatedStages,["render","master_qc","registry"]);
    addAll(invalidatedSceneIds.render,nextIds);
  }
  if(globalChanges.includes("production")){
    addAll(invalidatedStages,["images","technical_selection","creative_qc","promotion","render","master_qc","registry"]);
    addAll(invalidatedSceneIds.images,nextIds);
    addAll(invalidatedSceneIds.creative_qc,nextIds);
    addAll(invalidatedSceneIds.render,nextIds);
  }
  if(globalChanges.includes("features")){
    addAll(invalidatedStages,["prosody","voice","audio_master","music_mix","audio_attach","subtitles","pose_registry","asset_resolution","images","technical_selection","creative_qc","promotion","render","master_qc","registry"]);
    addAll(invalidatedSceneIds.voice,nextIds);
    addAll(invalidatedSceneIds.images,nextIds);
    addAll(invalidatedSceneIds.creative_qc,nextIds);
    addAll(invalidatedSceneIds.render,nextIds);
  }

  const sceneChanges=[];
  for(const [id,nextScene] of nextScenes){
    const previousScene=previousScenes.get(id);
    if(!previousScene){
      sceneChanges.push({scene_id:id,status:"added",changed_domains:["timing","voice","image","composition","captions"]});
      addAll(invalidatedStages,["prosody","voice","audio_master","music_mix","audio_attach","subtitles","asset_resolution","images","technical_selection","creative_qc","promotion","render","master_qc","registry"]);
      addAll(invalidatedSceneIds.voice,[id]);
      addAll(invalidatedSceneIds.images,[id]);
      addAll(invalidatedSceneIds.creative_qc,[id]);
      addAll(invalidatedSceneIds.render,[id]);
      continue;
    }
    const prev=sceneDomains(previousScene);
    const next=sceneDomains(nextScene);
    const changedDomains=Object.keys(prev).filter(key=>prev[key]!==next[key]);

    if(changedDomains.includes("timing")||changedDomains.includes("voice")){
      addAll(invalidatedStages,["prosody","voice","audio_master","music_mix","audio_attach","subtitles","promotion","render","master_qc","registry"]);
      addAll(invalidatedSceneIds.voice,[id]);
      addAll(invalidatedSceneIds.render,[id]);
    }
    if(changedDomains.includes("image")){
      addAll(invalidatedStages,["asset_resolution","images","technical_selection","creative_qc","promotion","render","master_qc","registry"]);
      addAll(invalidatedSceneIds.images,[id]);
      addAll(invalidatedSceneIds.creative_qc,[id]);
      addAll(invalidatedSceneIds.render,[id]);
    }
    if(changedDomains.includes("composition")){
      addAll(invalidatedStages,["promotion","render","master_qc","registry"]);
      addAll(invalidatedSceneIds.render,[id]);
    }
    if(changedDomains.includes("captions")){
      addAll(invalidatedStages,["subtitles","promotion","render","master_qc","registry"]);
    }

    sceneChanges.push({
      scene_id:id,
      status:changedDomains.length?"modified":"unchanged",
      changed_domains:changedDomains,
      previous_fingerprints:prev,
      next_fingerprints:next
    });
  }

  for(const id of previousIds.filter(id=>!nextScenes.has(id))){
    sceneChanges.push({scene_id:id,status:"removed",changed_domains:["structure"]});
  }

  if(structuralChange){
    addAll(invalidatedStages,["prosody","voice","audio_master","music_mix","audio_attach","subtitles","asset_resolution","images","technical_selection","creative_qc","promotion","render","master_qc","registry"]);
    addAll(invalidatedSceneIds.voice,nextIds);
    addAll(invalidatedSceneIds.images,nextIds);
    addAll(invalidatedSceneIds.creative_qc,nextIds);
    addAll(invalidatedSceneIds.render,nextIds);
  }

  const changedSceneIds=sceneChanges.filter(x=>x.status!=="unchanged").map(x=>x.scene_id);
  const unchangedSceneIds=nextIds.filter(id=>!changedSceneIds.includes(id));
  const reusable={
    voice:nextIds.filter(id=>!invalidatedSceneIds.voice.has(id)),
    images:nextIds.filter(id=>!invalidatedSceneIds.images.has(id)),
    render:nextIds.filter(id=>!invalidatedSceneIds.render.has(id))
  };

  return {
    schema:ITERATION_PLAN_SCHEMA,
    content_id:nextContent||previousContent||null,
    previous_contract_sha256:fingerprint(previousContract),
    next_contract_sha256:fingerprint(nextContract),
    structural_change:structuralChange,
    global_changes:globalChanges,
    changed_scene_ids:changedSceneIds,
    unchanged_scene_ids:unchangedSceneIds,
    scene_changes:sceneChanges,
    invalidated_stages:[...invalidatedStages].sort(),
    invalidated_scene_ids:{
      voice:[...invalidatedSceneIds.voice].sort(),
      images:[...invalidatedSceneIds.images].sort(),
      creative_qc:[...invalidatedSceneIds.creative_qc].sort(),
      render:[...invalidatedSceneIds.render].sort()
    },
    reusable_scene_ids:reusable,
    policy:{
      unchanged_scene_artifacts_may_be_reused:true,
      caption_only_change_does_not_invalidate_voice_or_images:true,
      image_only_change_does_not_invalidate_voice:true,
      narration_change_does_not_invalidate_images_unless_visual_brief_changes:true,
      structural_change_is_conservative:true,
      human_review_required:true,
      publication_authorized:false
    }
  };
}

if(import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [previousPath,nextPath,outPath]=process.argv.slice(2);
  if(!previousPath||!nextPath||!outPath) fail("usage: node scripts/video-iteration-plan.mjs previous.json next.json output.json");
  const previous=JSON.parse(readFileSync(resolve(previousPath),"utf8"));
  const next=JSON.parse(readFileSync(resolve(nextPath),"utf8"));
  const plan=buildIterationPlan(previous,next);
  writeFileSync(resolve(outPath),JSON.stringify(plan,null,2)+"\n");
  process.stdout.write(JSON.stringify({ok:true,schema:plan.schema,changed_scenes:plan.changed_scene_ids.length,invalidated_stages:plan.invalidated_stages})+"\n");
}
