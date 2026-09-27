#!/usr/bin/env node

export const LAYER_GUARD_SCHEMA="HIBOU_GLOBAL_SPECIFIC_GUARD_V1";

const FORBIDDEN_SCENE_KEYS=new Set([
  "music","global_music","branding","brand",
  "creative","style_lock","negative_prompt","character_lock",
  "global_profile","profile","profile_version","method_version",
  "qc","creative_qc","engine","renderer","runtime_commit","features"
]);

const ALLOWED_SCENE_KEYS=new Set([
  "scene_id","order","narration_exact","visual_idea","image_prompt","screen_text",
  "planned_duration_s","measured_duration_s","zoom_percent","framing","image",
  "breath_unit","voice","timeline","pose_request","music_cue","composition",
  "render_artifact","pose_registry","pose_registry_resolution"
]);

function fail(message){ throw new Error(message); }

export function inspectSpecificScene(scene){
  const forbidden=[];
  const unknown=[];
  for(const key of Object.keys(scene||{})){
    if(FORBIDDEN_SCENE_KEYS.has(key)) forbidden.push(key);
    else if(!ALLOWED_SCENE_KEYS.has(key)) unknown.push(key);
  }
  return {
    schema:LAYER_GUARD_SCHEMA,
    scene_id:String(scene?.scene_id||""),
    forbidden_global_overrides:forbidden.sort(),
    unknown_scene_keys:unknown.sort(),
    pass:forbidden.length===0
  };
}

export function validateGlobalSpecificSeparation(contract,{rejectUnknown=false}={}){
  if(contract?.contract_version!=="HIBOU_VIDEO_CONTRACT_V1") fail("unsupported contract");
  const scenes=(contract.scenes||[]).map(inspectSpecificScene);
  const forbidden=scenes.filter(x=>x.forbidden_global_overrides.length);
  const unknown=scenes.filter(x=>x.unknown_scene_keys.length);
  if(forbidden.length){
    const detail=forbidden.map(x=>`${x.scene_id||"?"}: ${x.forbidden_global_overrides.join(",")}`).join("; ");
    fail(`specific scene attempted GLOBAL override: ${detail}`);
  }
  if(rejectUnknown&&unknown.length){
    const detail=unknown.map(x=>`${x.scene_id||"?"}: ${x.unknown_scene_keys.join(",")}`).join("; ");
    fail(`unknown specific scene keys: ${detail}`);
  }
  return {
    schema:LAYER_GUARD_SCHEMA,
    pass:true,
    checked_scenes:scenes.length,
    unknown_scene_keys:unknown.flatMap(x=>x.unknown_scene_keys),
    invariant:"SPECIFIC scenes cannot redefine GLOBAL style/music/branding/QC/runtime controls"
  };
}
