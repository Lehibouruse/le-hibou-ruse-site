#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function fail(message){ throw new Error(message); }
function num(value){ if(value===null||value===undefined||value==="") return null; const n=Number(value); return Number.isFinite(n)?n:null; }
function clamp(value,min,max){ return Math.min(max,Math.max(min,value)); }
function round(value,n=2){ return Number.isFinite(value)?Number(value.toFixed(n)):null; }

const METRICS = {
  duration_s: {
    label:"Durée",
    ref:(p)=>p?.overall?.duration_s,
    value:(m)=>num(m?.media?.duration_s),
    unit:"s",
    low:"allonger légèrement",
    high:"raccourcir légèrement",
    weight:1.0,
  },
  cuts_per_minute: {
    label:"Cuts par minute",
    ref:(p)=>p?.overall?.cuts_per_minute,
    value:(m)=>{
      const duration=num(m?.media?.duration_s), cuts=num(m?.scene?.cut_count);
      return duration>0&&cuts!==null?cuts/duration*60:null;
    },
    unit:"cuts/min",
    low:"accélérer le rythme de coupe",
    high:"ralentir le rythme de coupe",
    weight:1.25,
  },
  scene_median_s: {
    label:"Durée médiane de scène",
    ref:(p)=>p?.overall?.scene_median_s,
    value:(m)=>num(m?.scene?.median_scene_duration_s),
    unit:"s",
    low:"laisser davantage respirer les scènes",
    high:"raccourcir les scènes",
    weight:1.0,
  },
  silence_ratio: {
    label:"Ratio de silence",
    ref:(p)=>p?.overall?.silence_ratio,
    value:(m)=>num(m?.voice?.silence_ratio),
    unit:"ratio",
    low:"ajouter un peu de respiration",
    high:"réduire les silences",
    weight:1.0,
  },
  mean_volume_db: {
    label:"Volume moyen",
    ref:(p)=>p?.overall?.mean_volume_db,
    value:(m)=>num(m?.voice?.mean_db),
    unit:"dB",
    low:"remonter légèrement le niveau moyen",
    high:"baisser légèrement le niveau moyen",
    weight:0.8,
  },
  speech_wpm: {
    label:"Débit de parole",
    ref:(p)=>p?.overall?.speech_wpm,
    value:(m)=>num(m?.speech?.words_per_minute ?? m?.transcript?.words_per_minute),
    unit:"mots/min",
    low:"accélérer légèrement le débit",
    high:"ralentir légèrement le débit",
    weight:1.0,
  },
  text_density: {
    label:"Densité textuelle",
    ref:(p)=>p?.overall?.text_density,
    value:(m)=>num(m?.visual?.text_density ?? m?.text_density),
    unit:"index",
    low:"augmenter la densité textuelle",
    high:"alléger la densité textuelle",
    weight:0.8,
  },
  motion_score: {
    label:"Mouvement visuel",
    ref:(p)=>p?.overall?.motion_score,
    value:(m)=>num(m?.visual?.motion_score ?? m?.motion?.score),
    unit:"index",
    low:"augmenter légèrement le mouvement",
    high:"réduire le mouvement",
    weight:0.8,
  },
};

function usableReference(stats){
  const median=num(stats?.median), p25=num(stats?.p25), p75=num(stats?.p75);
  if(median===null) return null;
  const spread=(p25!==null&&p75!==null)?Math.abs(p75-p25):0;
  const fallback=Math.max(Math.abs(median)*0.15,0.05);
  return {median,p25,p75,scale:spread>1e-9?spread:fallback};
}

export function scoreMetric(value,stats){
  const v=num(value), ref=usableReference(stats);
  if(v===null||!ref) return null;
  const distance=Math.abs(v-ref.median);
  const normalized=distance/ref.scale;
  // 100 at median, 80 around one IQR, 50 around 2.5 IQR, 0 at 5 IQR.
  const score=clamp(100-20*normalized,0,100);
  const insideBand=ref.p25!==null&&ref.p75!==null
    ? v>=Math.min(ref.p25,ref.p75)&&v<=Math.max(ref.p25,ref.p75)
    : normalized<=1;
  return {
    value:round(v,4),
    target_median:round(ref.median,4),
    target_p25:round(ref.p25,4),
    target_p75:round(ref.p75,4),
    normalized_distance:round(normalized,3),
    inside_reference_band:insideBand,
    score:round(score,1),
  };
}

export function qualityProximity(profile,hibouManifest){
  if(profile?.schema!=="HIBOU_VIDEO_STYLE_PROFILE_V1") fail("HIBOU_VIDEO_STYLE_PROFILE_V1 required");
  if(!hibouManifest?.media||!hibouManifest?.scene||!hibouManifest?.voice) fail("forensic manifest with media/scene/voice required");

  const details={};
  let weighted=0,totalWeight=0,available=0;
  for(const [key,def] of Object.entries(METRICS)){
    const value=def.value(hibouManifest);
    const metric=scoreMetric(value,def.ref(profile));
    if(!metric){
      details[key]={
        label:def.label,
        status:"not_measured",
        score:null,
        recommendation:"mesure absente — ne pas extrapoler",
        weight:def.weight,
      };
      continue;
    }
    available+=1;
    totalWeight+=def.weight;
    weighted+=metric.score*def.weight;
    const v=metric.value, p25=metric.target_p25, p75=metric.target_p75;
    let recommendation="dans la zone de référence";
    if(p25!==null&&v<p25) recommendation=def.low;
    else if(p75!==null&&v>p75) recommendation=def.high;
    details[key]={
      label:def.label,
      unit:def.unit,
      status:"measured",
      ...metric,
      recommendation,
      weight:def.weight,
    };
  }
  const measured=Object.keys(METRICS).length;
  const global=totalWeight>0?weighted/totalWeight:null;
  const coverage=available/measured;
  return {
    schema:"HIBOU_VIDEO_QUALITY_PROXIMITY_V1",
    generated_at:new Date().toISOString(),
    reference_sources:Number(profile.source_count||0),
    reference_competitors:Number(profile.competitor_count||0),
    overall_score:round(global,1),
    coverage:{
      measured_metrics:available,
      possible_metrics:measured,
      ratio:round(coverage,3),
      sufficient_for_global_interpretation:available>=4,
    },
    subscores:details,
    recommendations:Object.entries(details)
      .filter(([,v])=>v.status==="measured" && !v.inside_reference_band)
      .sort((a,b)=>(a[1].score??100)-(b[1].score??100))
      .map(([metric,v])=>({metric,label:v.label,score:v.score,action:v.recommendation})),
    policy:{
      evaluates_quality_proximity_not_identity_copy:true,
      missing_metrics_are_not_penalized:true,
      human_review_required:true,
      automatic_publication_authorized:false,
    },
  };
}

if(import.meta.url===`file://${process.argv[1]}`){
  const [profilePath,manifestPath,outPath]=process.argv.slice(2);
  if(!profilePath||!manifestPath) fail("usage: video-quality-proximity.mjs style-profile.json hibou-forensic-manifest.json [output.json]");
  const profile=JSON.parse(readFileSync(resolve(profilePath),"utf8"));
  const manifest=JSON.parse(readFileSync(resolve(manifestPath),"utf8"));
  const report=qualityProximity(profile,manifest);
  const body=JSON.stringify(report,null,2)+"\n";
  if(outPath) writeFileSync(resolve(outPath),body,{encoding:"utf8",mode:0o600});
  process.stdout.write(body);
}
