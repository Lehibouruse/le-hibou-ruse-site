#!/usr/bin/env node
import { createHash } from "node:crypto";

export const LAYER_GUARD_SCHEMA="HIBOU_GLOBAL_SPECIFIC_GUARD_V1";
export const PROMPT_CONTRACT_SCHEMA="HIBOU_PROMPT_CONTRACT_V2";

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
function stableValue(value){
  if(Array.isArray(value)) return value.map(stableValue);
  if(value===null||typeof value!=="object") return value;
  return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stableValue(value[key])]));
}
function stableJson(value){ return JSON.stringify(stableValue(value)); }
function sha256Value(value){
  return createHash("sha256").update(stableJson(value),"utf8").digest("hex");
}
function globalPromptPayload(contract){
  const creative=contract?.creative||{};
  const audio=contract?.audio||{};
  const music=contract?.music||{};
  const subtitles=contract?.subtitles||{};
  return {
    content:{
      source:String(contract?.content?.source||""),
      method_version:String(contract?.content?.method_version||""),
      profile_version:String(contract?.content?.profile_version||"")
    },
    creative:{
      profile_name:creative.profile_name??null,
      style_lock:creative.style_lock??null,
      negative_prompt:creative.negative_prompt??null,
      character_lock:creative.character_lock??null,
      content_brief:creative.content_brief??null,
      reference_mode:creative.reference_mode??null,
      reference_asset_repo_path:creative.reference_asset_repo_path??null,
      text_in_generated_images:creative.text_in_generated_images??null,
      branding:creative.branding??null,
      pacing:creative.pacing??null,
      production_defaults:creative.production_defaults??null,
      movement_profile:creative.movement_profile??null,
      curve_profile:creative.curve_profile??null
    },
    audio:{
      voice_profile_id:audio.voice_profile_id??null,
      voice_profile_text:audio.voice_profile_text??null,
      density_profile:audio.density_profile??null
    },
    music:{
      reference:music.reference??null,
      license:music.license??null,
      level_db:music.level_db??null,
      duck_threshold:music.duck_threshold??null,
      duck_ratio:music.duck_ratio??null,
      duck_attack_ms:music.duck_attack_ms??null,
      duck_release_ms:music.duck_release_ms??null,
      fade_in_s:music.fade_in_s??null,
      fade_out_s:music.fade_out_s??null
    },
    subtitles:{
      safe_area_top_pct:subtitles.safe_area_top_pct??null,
      safe_area_bottom_pct:subtitles.safe_area_bottom_pct??null,
      safe_area_side_pct:subtitles.safe_area_side_pct??null,
      max_lines:subtitles.max_lines??null,
      max_chars_per_line:subtitles.max_chars_per_line??null,
      font_family_policy:subtitles.font_family_policy??null,
      style_profile:subtitles.style_profile??null
    }
  };
}
function specificPromptPayload(scene){
  return {
    scene_id:String(scene?.scene_id||""),
    order:Number(scene?.order||0),
    narration_exact:scene?.narration_exact??null,
    visual_idea:scene?.visual_idea??null,
    image_prompt:scene?.image_prompt??null,
    screen_text:scene?.screen_text??null,
    planned_duration_s:Number(scene?.planned_duration_s||0),
    zoom_percent:scene?.zoom_percent??null,
    framing:scene?.framing??null,
    breath_unit:scene?.breath_unit??null,
    voice:{
      relative_speed_pct:scene?.voice?.relative_speed_pct??null,
      pause_after_ms:scene?.voice?.pause_after_ms??null,
      intent:scene?.voice?.intent??null
    },
    timeline:scene?.timeline??null,
    pose_request:scene?.pose_request??null,
    music_cue:scene?.music_cue??null,
    editorial:{
      persona_case:scene?.persona_case??null,
      qualify:scene?.qualify??null,
      disqualify:scene?.disqualify??null,
      condition:scene?.condition??null,
      risk:scene?.risk??null,
      source_label:scene?.source_label??null,
      jurisdiction:scene?.jurisdiction??null,
      as_of_date:scene?.as_of_date??null
    }
  };
}
export function buildPromptContractV2(contract){
  if(contract?.contract_version!=="HIBOU_VIDEO_CONTRACT_V1") fail("unsupported contract");
  const global_payload=globalPromptPayload(contract);
  const global_sha256=sha256Value(global_payload);
  const scenes=(contract.scenes||[]).map(scene=>{
    const specific_payload=specificPromptPayload(scene);
    const specific_sha256=sha256Value(specific_payload);
    return {
      scene_id:String(scene?.scene_id||""),
      specific_sha256,
      combined_sha256:sha256Value({global_sha256,specific_sha256}),
      specific_payload
    };
  });
  const contract_sha256=sha256Value({
    schema:PROMPT_CONTRACT_SCHEMA,
    global_sha256,
    scenes:scenes.map(x=>({scene_id:x.scene_id,specific_sha256:x.specific_sha256,combined_sha256:x.combined_sha256}))
  });
  return {
    schema:PROMPT_CONTRACT_SCHEMA,
    strict:true,
    global_sha256,
    contract_sha256,
    global_payload,
    scenes,
    required_stage_continuity:[
      "storyboard","prosody","voice","audio_attach","subtitles","style","pose_registry",
      "asset_resolution","image_plan","image_regeneration","technical_selection",
      "creative_qc","factual_gate","promotion","render_ready"
    ],
    publication_authorized:false
  };
}
export function validatePromptContractContinuity(contract,expected=null,{stage="unknown"}={}){
  if(contract?.contract_version!=="HIBOU_VIDEO_CONTRACT_V1") fail(stage+": unsupported contract");
  const reference=expected||contract?.prompt_contract_v2;
  if(reference?.schema!==PROMPT_CONTRACT_SCHEMA) fail(stage+": prompt_contract_v2 missing");
  if(contract?.prompt_contract_v2?.schema!==PROMPT_CONTRACT_SCHEMA){
    fail(stage+": embedded prompt_contract_v2 missing from artifact");
  }
  if(contract.prompt_contract_v2.contract_sha256!==reference.contract_sha256){
    fail(stage+": embedded prompt contract hash mismatch");
  }
  const currentGlobal=sha256Value(globalPromptPayload(contract));
  if(currentGlobal!==reference.global_sha256){
    fail(stage+": GLOBAL prompt hash drift: "+currentGlobal+" != "+reference.global_sha256);
  }
  const expectedScenes=new Map((reference.scenes||[]).map(x=>[String(x.scene_id),x]));
  const checked=[];
  for(const scene of contract.scenes||[]){
    const id=String(scene?.scene_id||"");
    const ref=expectedScenes.get(id);
    if(!ref) fail(stage+": scene missing from prompt contract: "+id);
    const currentPayload=specificPromptPayload(scene);
    const postVoice=String(scene?.narration_exact?.mode||"")==="audio_reference"||nonEmpty(scene?.narration_text);
    if(postVoice){
      const expectedText=String(ref?.specific_payload?.narration_exact?.text||"").trim();
      const actualText=String(scene?.narration_text||scene?.narration_exact?.text||"").trim();
      if(actualText!==expectedText){
        fail(stage+": exact narration drift for "+id);
      }
      const target=Number(ref?.specific_payload?.planned_duration_s||0);
      const actual=Number(scene?.planned_duration_s||0);
      const tolerance=Math.max(0.25,target*0.05);
      if(target>0&&(!Number.isFinite(actual)||Math.abs(actual-target)>tolerance)){
        fail(stage+": scene duration drift beyond prompt tolerance for "+id+": "+actual+" vs "+target);
      }
      currentPayload.narration_exact=ref.specific_payload.narration_exact;
      currentPayload.planned_duration_s=ref.specific_payload.planned_duration_s;
    }
    const specific_sha256=sha256Value(currentPayload);
    if(specific_sha256!==ref.specific_sha256){
      fail(stage+": SPECIFIC prompt hash drift for "+id+": "+specific_sha256+" != "+ref.specific_sha256);
    }
    checked.push(id);
  }
  if(checked.length!==expectedScenes.size){
    const actual=new Set(checked);
    const missing=[...expectedScenes.keys()].filter(id=>!actual.has(id));
    fail(stage+": scenes lost from prompt contract: "+missing.join(","));
  }
  return {
    schema:"HIBOU_PROMPT_CONTRACT_CONTINUITY_V2",
    pass:true,
    stage,
    contract_sha256:reference.contract_sha256,
    global_sha256:reference.global_sha256,
    checked_scenes:checked.length,
    specific_hashes:Object.fromEntries((reference.scenes||[]).map(x=>[x.scene_id,x.specific_sha256])),
    publication_authorized:false
  };
}

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
