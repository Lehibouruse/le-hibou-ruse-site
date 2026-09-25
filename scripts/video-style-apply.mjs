#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildHibouProductionProfile } from "./video-production-profile.mjs";

function fail(m){throw new Error(m);}
function finite(v){const n=Number(v);return Number.isFinite(n)?n:null;}

export function applyStyleProfile(contract,profile,{force=false,format="ILLUSTRATED_EXPLAINER"}={}){
  if(contract?.contract_version!=="HIBOU_VIDEO_CONTRACT_V1") fail("unsupported video contract");
  if(profile?.schema!=="HIBOU_VIDEO_STYLE_PROFILE_V1") fail("unsupported style profile");
  const production=buildHibouProductionProfile(profile,{format});
  const zoom=finite(production.controls?.renderer?.zoom_percent);
  if(zoom===null||zoom<2||zoom>4) fail("invalid production zoom");

  const out=structuredClone(contract);
  out.production_profile=production;
  out.style_profile={
    schema:profile.schema,
    generated_at:profile.generated_at,
    source_count:profile.source_count,
    competitor_count:profile.competitor_count,
    selected_format:format,
    applied_controls:{
      zoom_percent:zoom,
      asset_resolution_reuse_first:true,
      default_transition:"hard-cut"
    },
    guidance_targets:production.targets,
    guidance_status:production.guidance_status,
    policy:production.policy
  };

  out.scenes=(out.scenes||[]).map(scene=>{
    const next=structuredClone(scene);
    if(force || !Number.isFinite(Number(next.zoom_percent))) next.zoom_percent=zoom;
    next.style_guidance={
      schema:"HIBOU_SCENE_STYLE_GUIDANCE_V2",
      source_profile:"HIBOU_VIRAL_V2",
      attention_event_interval_s:production.targets.attention.event_interval_s,
      attention_proxy_only:true,
      composition_change_interval_s:production.targets.composition.change_interval_s,
      static_hold_ratio:production.targets.composition.static_hold_ratio,
      caption_duration_s:production.targets.captions.duration_s,
      caption_tokens:production.targets.captions.tokens_per_caption,
      motion_budget:production.targets.motion.motion_budget,
      asset_reuse_rate:production.targets.assets.reuse_rate,
      target_wpm:production.targets.narration.target_wpm,
      target_prosody_semitone_range:production.targets.narration.target_prosody_semitone_range
    };
    // target_wpm is metadata/QC guidance. Chatterbox does not expose a native WPM control.
    if(production.targets.narration.target_wpm!==null){
      next.voice={...(next.voice||{})};
      if(force || !Number.isFinite(Number(next.voice.target_wpm))){
        next.voice.target_wpm=production.targets.narration.target_wpm;
        next.voice.target_wpm_source="HIBOU_VIRAL_V2_guidance_not_native_control";
      }
    }
    return next;
  });
  return out;
}

if(import.meta.url===`file://${process.argv[1]}`){
  const [contractPath,profilePath,outPath,...rest]=process.argv.slice(2);
  if(!contractPath||!profilePath||!outPath) fail("usage: video-style-apply.mjs contract.json style-profile.json output.json [--force] [--format=ILLUSTRATED_EXPLAINER]");
  const contract=JSON.parse(readFileSync(resolve(contractPath),"utf8"));
  const profile=JSON.parse(readFileSync(resolve(profilePath),"utf8"));
  const format=rest.find(x=>x.startsWith("--format="))?.slice(9)||"ILLUSTRATED_EXPLAINER";
  const out=applyStyleProfile(contract,profile,{force:rest.includes("--force"),format});
  writeFileSync(resolve(outPath),JSON.stringify(out,null,2)+"\n");
  process.stdout.write(JSON.stringify({
    ok:true,
    scenes:out.scenes.length,
    zoom:out.style_profile.applied_controls.zoom_percent,
    production_profile:out.production_profile.schema,
    format:out.production_profile.selected_format,
    experiments:out.production_profile.experiments.length
  })+"\n");
}
