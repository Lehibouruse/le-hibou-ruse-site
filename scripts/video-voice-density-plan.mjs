#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const VOICE_DENSITY_PLAN_SCHEMA = "HIBOU_VIDEO_VOICE_DENSITY_PLAN_V1";
const PROFILES = ["RELENTLESS","EXPLAINER_DENSE"];

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
function densityProfile(contract){
  const value=text(contract?.audio?.density_profile || contract?.creative?.voice_density_profile).toUpperCase();
  if(!value) return null;
  if(!PROFILES.includes(value)) fail(`VOICE_DENSITY_PROFILE must be one of: ${PROFILES.join(", ")}`);
  return value;
}
function plannedPauses(scene){
  const voice=scene?.voice||{};
  const pauses=[];
  const scenePause=Number(voice.pause_after_ms);
  if(Number.isFinite(scenePause) && scenePause>0){
    pauses.push({source:"scene.pause_after_ms",ms:Math.round(scenePause)});
  }
  for(const [index,cue] of (Array.isArray(voice.prosody_cues)?voice.prosody_cues:[]).entries()){
    for(const key of ["pause_before_ms","pause_after_ms"]){
      const value=Number(cue?.[key]);
      if(Number.isFinite(value) && value>0){
        pauses.push({
          source:`prosody_cues[${index}].${key}`,
          phrase:text(cue?.phrase)||null,
          ms:Math.round(value),
        });
      }
    }
  }
  return pauses;
}

export function buildVoiceDensityPlan(contract){
  if(contract?.contract_version!=="HIBOU_VIDEO_CONTRACT_V1") fail("HIBOU_VIDEO_CONTRACT_V1 required");
  const scenes=Array.isArray(contract.scenes)?contract.scenes:[];
  if(!scenes.length) fail("at least one scene required");

  const profile=densityProfile(contract);
  const warnings=[];
  if(!profile) warnings.push({code:"voice_density_profile_missing"});

  const scenePlans=scenes.map((scene,index)=>{
    const sceneId=text(scene?.scene_id);
    if(!sceneId) fail(`scene ${index+1}: scene_id missing`);
    const pauses=plannedPauses(scene);
    const maxPauseMs=pauses.length?Math.max(...pauses.map(x=>x.ms)):0;
    const over250=pauses.filter(x=>x.ms>250);
    const sceneWarnings=[];

    if(profile==="RELENTLESS" && over250.length){
      const warning={
        code:"relentless_planned_pause_over_250ms",
        scene_id:sceneId,
        pauses:over250,
      };
      warnings.push(warning);
      sceneWarnings.push(warning.code);
    }

    return {
      scene_id:sceneId,
      order:Number(scene?.order||index+1),
      profile,
      target_wpm:Number(scene?.voice?.target_wpm||0)||null,
      relative_speed_pct:Number(scene?.voice?.relative_speed_pct||100),
      planned_pause_count:pauses.length,
      max_planned_pause_ms:maxPauseMs,
      planned_pauses:pauses,
      warnings:sceneWarnings,
    };
  });

  const core={
    schema:VOICE_DENSITY_PLAN_SCHEMA,
    content_id:text(contract?.content?.content_id)||null,
    density_profile:profile,
    scene_count:scenePlans.length,
    scenes:scenePlans,
    warnings,
    review_required:warnings.some(w=>w.code!=="voice_density_profile_missing"),
    profile_policy:profile==="RELENTLESS"?{
      source_observation:"calibration batch: zero silence >250 ms on reference simple-procedure videos",
      deliberate_pause_soft_limit_ms:250,
      delivery:"continuous",
      long_pause_requires_explicit_human_override:true,
    }:profile==="EXPLAINER_DENSE"?{
      source_observation:"calibration batch: controlled micro-pauses for denser finance/tax explanations",
      deliberate_pause_soft_limit_ms:null,
      delivery:"dense_with_controlled_micro_pauses",
      numeric_pause_threshold_requires_audio_e2e_calibration:true,
    }:null,
    policy:{
      planning_only:true,
      narration_mutation:false,
      prosody_mutation:false,
      tts_execution_performed:false,
      audio_execution_performed:false,
      gpu_execution_performed:false,
      contract_mutation_performed:false,
      publication_authorized:false,
      explainer_dense_threshold_not_invented:true,
    },
  };
  return {...core,voice_density_plan_sha256:sha256(core)};
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [input,output]=process.argv.slice(2);
  if(!input||!output) fail("usage: node scripts/video-voice-density-plan.mjs storyboard.json voice-density-plan.json");
  const contract=JSON.parse(readFileSync(resolve(input),"utf8"));
  const plan=buildVoiceDensityPlan(contract);
  writeFileSync(resolve(output),JSON.stringify(plan,null,2)+"\n","utf8");
  process.stdout.write(JSON.stringify({
    ok:true,
    schema:plan.schema,
    output:resolve(output),
    density_profile:plan.density_profile,
    review_required:plan.review_required,
    voice_density_plan_sha256:plan.voice_density_plan_sha256,
    execution_performed:false,
  })+"\n");
}
