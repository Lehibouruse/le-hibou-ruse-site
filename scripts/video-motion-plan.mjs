#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const MOTION_PLAN_SCHEMA = "HIBOU_VIDEO_MOTION_PLAN_V1";

const MOVEMENT_PROFILES = [
  "CUT_DOMINANT",
  "HYBRID_BEATS",
  "INTRA_SCENE_MOTION",
];
const CURVE_PROFILES = [
  "HOOK_FAST_BODY_ADAPTIVE_CTA_OPTIONAL_BOOST",
];
const SCENE_MODES = ["STATIC_SCENE", "ANIMATED_SCENE"];

function fail(message){ throw new Error(message); }
function text(value){ return String(value ?? "").trim(); }
function stable(value){
  if(Array.isArray(value)) return value.map(stable);
  if(!value || typeof value!=="object") return value;
  return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));
}
function sha256(value){
  return createHash("sha256").update(JSON.stringify(stable(value)),"utf8").digest("hex");
}
function enumOrNull(value,allowed,label){
  const normalized=text(value).toUpperCase();
  if(!normalized) return null;
  if(!allowed.includes(normalized)) fail(`${label} must be one of: ${allowed.join(", ")}`);
  return normalized;
}
function hasMove(event,axis){
  const key=`move_to_offset_${axis}`;
  const target=event?.[key];
  if(target===undefined || target===null) return false;
  return Number(target)!==Number(event?.[`offset_${axis}`]||0);
}
function motionSignals(scene){
  const events=Array.isArray(scene?.timeline?.events)?scene.timeline.events:[];
  const signals={
    attention_beat_count:events.length,
    camera_motion_count:0,
    layer_motion_count:0,
    pose_change_count:0,
    prop_change_count:0,
    caption_change_count:0,
    risk_badge_count:0,
    condition_badge_count:0,
  };
  for(const event of events){
    const type=text(event?.type).toLowerCase();
    const kind=text(event?.beat_kind).toUpperCase();
    if(type==="camera" || kind==="MICRO_ZOOM") signals.camera_motion_count+=1;
    if(
      kind==="LAYER_MOTION" ||
      ((type==="object"||type==="pose") && (hasMove(event,"x")||hasMove(event,"y")))
    ) signals.layer_motion_count+=1;
    if(type==="pose" || kind==="POSE_CHANGE") signals.pose_change_count+=1;
    if(type==="object" || ["PROP_SWAP","MINI_DIAGRAM","BEFORE_AFTER"].includes(kind)) signals.prop_change_count+=1;
    if(type==="text" || type==="callout" || ["CAPTION_CHANGE","NUMBER_CALLOUT"].includes(kind)) signals.caption_change_count+=1;
    if(kind==="RISK_BADGE") signals.risk_badge_count+=1;
    if(kind==="CONDITION_BADGE") signals.condition_badge_count+=1;
  }
  return signals;
}
function specificActionCues(scene){
  const source=text(scene?.visual_idea).toLowerCase();
  if(!source) return [];
  const cues=[];
  const rules=[
    ["disappear",/\bdispara(?:î|i)t|\bdisparaissent?/iu],
    ["erase_remove",/\beffac(?:e|er)|\bretir(?:e|er)|(?:^|\s)élimin(?:e|er)|\bsupprim(?:e|er)/iu],
    ["open_passage",/\bouvre?\s+un\s+passage|\bpassage\s+s['’]ouvre/iu],
    ["appear",/\bappara(?:î|i)t|\bapparaissent?/iu],
    ["turn_rotate",/\btourne|\btourner|\brotat/iu],
    ["renew_recreate",/\brecr[eé][eé]|\brenouvel[eé]|\bencha[iî]nement/iu],
    ["accelerate",/\bacc[eé]l[eé]r/iu],
  ];
  for(const [code,re] of rules){ if(re.test(source)) cues.push(code); }
  return cues;
}
function curveZone(scene,curveProfile){
  if(!curveProfile) return null;
  const intent=text(scene?.voice?.intent).toLowerCase();
  if(intent==="hook" || intent.startsWith("hook_")) return "HOOK_FAST";
  if(["cta","conclusion_cta","payoff_cta"].includes(intent)) return "CTA_OPTIONAL_BOOST";
  return "BODY_ADAPTIVE";
}
function resolveSceneMode(scene,profile,signals,warnings){
  const sceneId=text(scene?.scene_id)||"scene";
  const explicit=enumOrNull(scene?.motion_mode,SCENE_MODES,`${sceneId} motion_mode`);
  if(explicit){
    if(explicit==="STATIC_SCENE" && (signals.layer_motion_count>0||signals.camera_motion_count>0)){
      warnings.push({code:"static_scene_contains_motion",scene_id:sceneId});
    }
    if(explicit==="ANIMATED_SCENE" && signals.layer_motion_count===0 && signals.camera_motion_count===0){
      warnings.push({code:"animated_scene_has_no_motion_signal",scene_id:sceneId});
    }
    return {mode:explicit,source:"explicit_scene_contract"};
  }

  if(!profile) return {mode:null,source:"movement_profile_missing"};

  if(profile==="CUT_DOMINANT"){
    return (signals.layer_motion_count>0||signals.camera_motion_count>0)
      ? {mode:"ANIMATED_SCENE",source:signals.layer_motion_count>0?"explicit_layer_motion_signal":"explicit_camera_motion_signal"}
      : {mode:"STATIC_SCENE",source:"cut_dominant_default"};
  }

  if(profile==="HYBRID_BEATS"){
    return (signals.layer_motion_count>0||signals.camera_motion_count>0)
      ? {mode:"ANIMATED_SCENE",source:signals.layer_motion_count>0?"explicit_layer_motion_signal":"explicit_camera_motion_signal"}
      : {mode:"STATIC_SCENE",source:"hybrid_static_default"};
  }

  if(profile==="INTRA_SCENE_MOTION"){
    if(signals.layer_motion_count>0||signals.camera_motion_count>0){
      return {mode:"ANIMATED_SCENE",source:signals.layer_motion_count>0?"explicit_layer_motion_signal":"explicit_camera_motion_signal"};
    }
    warnings.push({
      code:"intra_scene_motion_profile_without_explicit_motion",
      scene_id:sceneId,
    });
    return {mode:null,source:"explicit_motion_signal_required"};
  }

  return {mode:null,source:"unsupported_profile"};
}
function suggestedBeatKinds(profile){
  if(profile==="CUT_DOMINANT"){
    return ["CAPTION_CHANGE","NUMBER_CALLOUT","PROP_SWAP","POSE_CHANGE","VISUAL_ACCENT"];
  }
  if(profile==="HYBRID_BEATS"){
    return ["CAPTION_CHANGE","NUMBER_CALLOUT","PROP_SWAP","POSE_CHANGE","MICRO_ZOOM","LAYER_MOTION","MINI_DIAGRAM","BEFORE_AFTER","CONDITION_BADGE","RISK_BADGE"];
  }
  if(profile==="INTRA_SCENE_MOTION"){
    return ["LAYER_MOTION","MICRO_ZOOM","POSE_CHANGE","PROP_SWAP","CAPTION_CHANGE","MINI_DIAGRAM"];
  }
  return [];
}

export function buildMotionPlan(contract){
  if(contract?.contract_version!=="HIBOU_VIDEO_CONTRACT_V1") fail("HIBOU_VIDEO_CONTRACT_V1 required");
  const scenes=Array.isArray(contract.scenes)?contract.scenes:[];
  if(!scenes.length) fail("at least one scene required");

  const movementProfile=enumOrNull(
    contract?.creative?.movement_profile,
    MOVEMENT_PROFILES,
    "MOVEMENT_PROFILE",
  );
  const curveProfile=enumOrNull(
    contract?.creative?.curve_profile,
    CURVE_PROFILES,
    "CURVE_PROFILE",
  );

  const warnings=[];
  if(!movementProfile) warnings.push({code:"movement_profile_missing"});
  if(!curveProfile) warnings.push({code:"curve_profile_missing"});

  const scenePlans=scenes.map((scene,index)=>{
    const sceneId=text(scene?.scene_id);
    if(!sceneId) fail(`scene ${index+1}: scene_id missing`);
    const signals=motionSignals(scene);
    const actionCues=specificActionCues(scene);
    const specificExecutionGap=actionCues.length>0&&signals.attention_beat_count===0;
    if(specificExecutionGap){
      warnings.push({
        code:"specific_action_cues_unstructured",
        scene_id:sceneId,
        cues:actionCues,
      });
    }
    const mode=resolveSceneMode(scene,movementProfile,signals,warnings);
    return {
      scene_id:sceneId,
      order:Number(scene?.order||index+1),
      explicit_motion_mode:text(scene?.motion_mode)||null,
      recommended_motion_mode:mode.mode,
      recommendation_source:mode.source,
      curve_zone:curveZone(scene,curveProfile),
      voice_intent:text(scene?.voice?.intent)||null,
      specific_action_cues:actionCues,
      specific_execution_gap:specificExecutionGap,
      signals,
    };
  });

  const sceneModeCounts=scenePlans.reduce((acc,scene)=>{
    const key=scene.recommended_motion_mode||"UNRESOLVED";
    acc[key]=(acc[key]||0)+1;
    return acc;
  },{});
  const specificExecutionGapScenes=scenePlans.filter(scene=>scene.specific_execution_gap);

  const core={
    schema:MOTION_PLAN_SCHEMA,
    content_id:text(contract?.content?.content_id)||null,
    movement_profile:movementProfile,
    curve_profile:curveProfile,
    scene_count:scenePlans.length,
    scene_mode_counts:sceneModeCounts,
    specific_execution_gap_count:specificExecutionGapScenes.length,
    specific_execution_gap_scenes:specificExecutionGapScenes.map(scene=>scene.scene_id),
    suggested_beat_kinds:suggestedBeatKinds(movementProfile),
    scenes:scenePlans,
    warnings,
    policy:{
      planning_only:true,
      automatic_timeline_mutation:false,
      automatic_scene_mode_mutation:false,
      hard_cut_schedule_generated:false,
      model_calls_performed:false,
      gpu_execution_performed:false,
      contract_mutation_performed:false,
      publication_authorized:false,
      explicit_motion_signal_required_for_intra_scene_animation:true,
      unstructured_specific_actions_reported:true,
      camera_motion_reclassifies_scene:true,
      micro_zoom_does_not_by_itself_reclassify_static_scene:false,
    },
  };

  return {...core,motion_plan_sha256:sha256(core)};
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [input,output]=process.argv.slice(2);
  if(!input||!output) fail("usage: node scripts/video-motion-plan.mjs storyboard.json motion-plan.json");
  const contract=JSON.parse(readFileSync(resolve(input),"utf8"));
  const plan=buildMotionPlan(contract);
  writeFileSync(resolve(output),JSON.stringify(plan,null,2)+"\n","utf8");
  process.stdout.write(JSON.stringify({
    ok:true,
    schema:plan.schema,
    output:resolve(output),
    movement_profile:plan.movement_profile,
    scene_mode_counts:plan.scene_mode_counts,
    motion_plan_sha256:plan.motion_plan_sha256,
    execution_performed:false,
    publication_authorized:false,
  })+"\n");
}
