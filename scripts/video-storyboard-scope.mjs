#!/usr/bin/env node

function fail(message){ throw new Error(message); }

export function scopeStoryboardForJob(storyboard,{maxScenes=20,mode="final"}={}){
  if(storyboard?.contract_version!=="HIBOU_VIDEO_CONTRACT_V1") fail("unsupported contract");
  const scenes=Array.isArray(storyboard?.scenes)?storyboard.scenes:[];
  if(!scenes.length) fail("storyboard has no scenes");
  const limit=Math.max(1,Math.min(25,Math.floor(Number(maxScenes)||20)));
  const productionMode=String(mode||"final").trim().toLowerCase();
  if(!["preview","final"].includes(productionMode)) fail("mode must be preview or final");

  const out=structuredClone(storyboard);
  const originalSceneCount=scenes.length;
  const renderSceneCount=Math.min(originalSceneCount,limit);
  out.scenes=out.scenes.slice(0,renderSceneCount);
  const plannedDuration=out.scenes.reduce(
    (sum,scene)=>sum+Math.max(0,Number(scene?.planned_duration_s||0)),
    0
  );
  const partial=renderSceneCount<originalSceneCount;

  out.render_scope={
    schema:"HIBOU_VIDEO_RENDER_SCOPE_V1",
    mode:productionMode,
    original_scene_count:originalSceneCount,
    render_scene_count:renderSceneCount,
    max_scenes:limit,
    partial,
    scene_ids:out.scenes.map(scene=>String(scene?.scene_id||"")),
    publication_authorized:false
  };
  out.qc={
    ...(out.qc||{}),
    status:"TIMING_PASS_MEDIA_NOT_RUN",
    technical:{
      ...(out.qc?.technical||{}),
      planned_duration_s:Number(plannedDuration.toFixed(3)),
      scene_count:renderSceneCount
    }
  };
  out.validation={
    ...(out.validation||{}),
    human_required:true,
    publication_authorized:false,
    render_scope_partial:partial
  };
  return out;
}
