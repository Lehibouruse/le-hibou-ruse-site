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
  "visual_group","asset_requirements","asset_resolution",
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


function nonEmpty(value){ return Boolean(String(value??"").trim()); }
function finite(value){ return Number.isFinite(Number(value)); }

export function validatePromptPropagation(contract){
  if(contract?.contract_version!=="HIBOU_VIDEO_CONTRACT_V1") fail("unsupported contract");

  const airtable=String(contract?.content?.source||"").trim().toLowerCase()==="airtable";
  const creative=contract?.creative||{};
  const audio=contract?.audio||{};
  const branding=creative?.branding||{};
  const scenes=Array.isArray(contract?.scenes)?contract.scenes:[];

  const globalMissing=[];
  if(airtable){
    if(String(contract?.content?.method_version||"")!=="VIDEO_METHOD_V4.3"){
      globalMissing.push("content.method_version=VIDEO_METHOD_V4.3");
    }
    if(!String(contract?.content?.profile_version||"").includes("V4.3")){
      globalMissing.push("content.profile_version containing V4.3");
    }
    if(!nonEmpty(creative.style_lock)) globalMissing.push("creative.style_lock");
    if(!nonEmpty(creative.negative_prompt)) globalMissing.push("creative.negative_prompt");
    if(!nonEmpty(creative.character_lock)) globalMissing.push("creative.character_lock");
    if(!nonEmpty(creative.content_brief)) globalMissing.push("creative.content_brief");
    if(String(creative.reference_mode||"")!=="deterministic_character_overlay"){
      globalMissing.push("creative.reference_mode=deterministic_character_overlay");
    }
    if(creative.text_in_generated_images!==false){
      globalMissing.push("creative.text_in_generated_images=false");
    }
    if(!nonEmpty(branding.text)) globalMissing.push("creative.branding.text");
    if(!["sand","sable","gold"].includes(String(branding.color||"").trim().toLowerCase())){
      globalMissing.push("creative.branding.color=sand");
    }
    if(!nonEmpty(audio.voice_profile_id)) globalMissing.push("audio.voice_profile_id");
    if(!nonEmpty(audio.voice_profile_text)) globalMissing.push("audio.voice_profile_text");
  }

  const sceneFailures=[];
  let hibouScenes=0;
  let screenBeatScenes=0;
  let advancedTimelineScenes=0;
  let phraseProsodyScenes=0;

  for(const scene of scenes){
    const missing=[];
    const id=String(scene?.scene_id||scene?.order||"?");
    if(!nonEmpty(scene?.narration_exact?.text)) missing.push("narration_exact.text");
    if(!nonEmpty(scene?.visual_idea)&&!nonEmpty(scene?.image_prompt)){
      missing.push("visual_idea|image_prompt");
    }
    if(!nonEmpty(scene?.screen_text)) missing.push("screen_text");
    if(!finite(scene?.planned_duration_s)||Number(scene.planned_duration_s)<=0){
      missing.push("planned_duration_s");
    }
    if(!finite(scene?.voice?.relative_speed_pct)) missing.push("voice.relative_speed_pct");
    if(!finite(scene?.voice?.pause_after_ms)) missing.push("voice.pause_after_ms");
    if(!nonEmpty(scene?.voice?.intent)) missing.push("voice.intent");

    if(scene?.framing?.hibou){
      hibouScenes+=1;
      if(!nonEmpty(creative.reference_image_local)){
        missing.push("creative.reference_image_local for Hibou scene");
      }
    }

    if(nonEmpty(scene?.screen_text) && String(scene.screen_text).includes("/")){
      screenBeatScenes+=1;
    }
    if(Array.isArray(scene?.timeline?.events)&&scene.timeline.events.length){
      advancedTimelineScenes+=1;
    }
    if(Array.isArray(scene?.voice?.prosody_cues)&&scene.voice.prosody_cues.length){
      phraseProsodyScenes+=1;
    }

    if(missing.length) sceneFailures.push({scene_id:id,missing});
  }

  if(globalMissing.length){
    fail("GLOBAL prompt propagation incomplete: "+globalMissing.join(", "));
  }
  if(sceneFailures.length){
    fail(
      "SPECIFIC prompt propagation incomplete: "+
      sceneFailures.map(x=>x.scene_id+" -> "+x.missing.join(", ")).join("; ")
    );
  }

  return {
    schema:"HIBOU_PROMPT_PROPAGATION_AUDIT_V1",
    pass:true,
    source:airtable?"airtable":"file",
    checked_scenes:scenes.length,
    global:{
      style_lock:true,
      negative_prompt:true,
      character_lock:true,
      specific_brief_source:true,
      canonical_character_overlay:hibouScenes>0,
      branding:String(branding.color||""),
      voice_profile_id:String(audio.voice_profile_id||"")
    },
    routing:{
      image:"GLOBAL style/negative/character policy + current scene visual only",
      voice:"GLOBAL voice profile + exact narration + scene speed/pause/intent; phrase cues only when present and enabled",
      subtitles:"exact narration + scene screen_text; slash-separated text becomes baseline timed beats",
      compositor:"selected scene background + canonical Hibou overlay when requested + zoom + unique brand signature",
      timeline:"baseline screen-text beats always available; advanced object/pose/camera beats remain feature-gated",
      qc:"technical QC always required; creative semantic QC remains feature-gated"
    },
    coverage:{
      hibou_scenes:hibouScenes,
      slash_screen_beat_scenes:screenBeatScenes,
      advanced_timeline_scenes:advancedTimelineScenes,
      phrase_prosody_scenes:phraseProsodyScenes
    },
    invariant:"GLOBAL identity/voice/branding are mandatory; SPECIFIC narration/visual/text/timing/voice intent are mandatory; optional V5 refinements cannot disable the baseline prompt."
  };
}
