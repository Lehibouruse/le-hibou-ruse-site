#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import { createHash } from "node:crypto";

function fail(m){throw new Error(m);}
function quantile(values,p){
  const a=values.filter(Number.isFinite).sort((x,y)=>x-y);
  if(!a.length) return null;
  const i=(a.length-1)*p, lo=Math.floor(i), hi=Math.ceil(i);
  return lo===hi?a[lo]:a[lo]+(a[hi]-a[lo])*(i-lo);
}
function stats(values){
  const a=values.filter(Number.isFinite);
  if(!a.length) return {n:0,p25:null,median:null,p75:null,min:null,max:null};
  return {n:a.length,p25:quantile(a,.25),median:quantile(a,.5),p75:quantile(a,.75),min:Math.min(...a),max:Math.max(...a)};
}
function round(v,n=3){return Number.isFinite(v)?Number(v.toFixed(n)):null;}
function cleanStats(s){return Object.fromEntries(Object.entries(s).map(([k,v])=>[k,typeof v==="number"?round(v):v]));}
function walk(dir){
  const out=[];
  if(!existsSync(dir)) return out;
  for(const name of readdirSync(dir)){
    const p=resolve(dir,name), st=statSync(p);
    if(st.isDirectory()) out.push(...walk(p));
    else if(name==="manifest.json" && p.includes(sep+"_forensic"+sep)) out.push(p);
  }
  return out;
}
function sha256(path){return createHash("sha256").update(readFileSync(path)).digest("hex");}
function competitor(root,path){return relative(root,path).split(sep)[0]||"unknown";}

export function compileStyleProfile(entries,{minSources=1}={}){
  if(!Array.isArray(entries)||entries.length<minSources) fail("need at least "+minSources+" forensic sources");
  const rows=entries.map(e=>{
    const duration=Number(e.media?.duration_s), cuts=Number(e.scene?.cut_count);
    return {
      competitor:e.competitor||"unknown",
      source:e.source||null,
      source_sha256:e.source_sha256||null,
      duration_s:duration,
      cut_count:cuts,
      cuts_per_minute:duration>0?cuts/duration*60:null,
      scene_median_s:Number(e.scene?.median_scene_duration_s),
      scene_mean_s:Number(e.scene?.mean_scene_duration_s),
      silence_ratio:Number(e.voice?.silence_ratio),
      speaking_ratio:Number(e.voice?.speaking_ratio),
      mean_volume_db:Number(e.voice?.mean_db),
      max_volume_db:Number(e.voice?.max_db)
    };
  });
  const metric=k=>cleanStats(stats(rows.map(x=>x[k])));
  const overall={
    duration_s:metric("duration_s"),
    cuts_per_minute:metric("cuts_per_minute"),
    scene_median_s:metric("scene_median_s"),
    scene_mean_s:metric("scene_mean_s"),
    silence_ratio:metric("silence_ratio"),
    speaking_ratio:metric("speaking_ratio"),
    mean_volume_db:metric("mean_volume_db"),
    max_volume_db:metric("max_volume_db")
  };
  const byCompetitor={};
  for(const name of [...new Set(rows.map(x=>x.competitor))]){
    const rs=rows.filter(x=>x.competitor===name);
    const m=k=>cleanStats(stats(rs.map(x=>x[k])));
    byCompetitor[name]={
      sources:rs.length,
      duration_s:m("duration_s"),
      cuts_per_minute:m("cuts_per_minute"),
      scene_median_s:m("scene_median_s"),
      silence_ratio:m("silence_ratio"),
      mean_volume_db:m("mean_volume_db")
    };
  }
  const cuts=overall.cuts_per_minute.median;
  const zoom=Number.isFinite(cuts)?Math.min(4,Math.max(2,2+(cuts/30))):3;
  return {
    schema:"HIBOU_VIDEO_STYLE_PROFILE_V1",
    generated_at:new Date().toISOString(),
    source_count:rows.length,
    competitor_count:Object.keys(byCompetitor).length,
    sources:rows,
    overall,
    by_competitor:byCompetitor,
    production_profile:{
      target_duration_s:{
        min:round(overall.duration_s.p25),
        preferred:round(overall.duration_s.median),
        max:round(overall.duration_s.p75)
      },
      visual_cadence:{
        cuts_per_minute:round(cuts),
        scene_median_s:round(overall.scene_median_s.median)
      },
      motion:{
        default_zoom_percent:round(zoom,2),
        zoom_percent_min:2,
        zoom_percent_max:4
      },
      voice:{
        target_silence_ratio:round(overall.silence_ratio.median),
        target_mean_volume_db:round(overall.mean_volume_db.median)
      },
      renderer:{width:1080,height:1920,fps:30},
      policy:{
        functional_invariants_only:true,
        copy_competitor_identity:false,
        human_validation_before_lock:true
      }
    }
  };
}
export function loadForensicRoot(root){
  return walk(root).map(path=>{
    const m=JSON.parse(readFileSync(path,"utf8"));
    if(m.schema!=="HIBOU_FORENSIC_PACKAGE_V1") return null;
    return {
      competitor:competitor(root,path),
      source:path,
      source_sha256:sha256(path),
      media:m.media,
      scene:m.scene,
      voice:m.voice
    };
  }).filter(Boolean);
}
if(import.meta.url===`file://${process.argv[1]}`){
  const [rootArg,outArg,...rest]=process.argv.slice(2);
  if(!rootArg||!outArg) fail("usage: video-style-profile.mjs forensic-root output.json [--min-sources=N]");
  const flag=rest.find(x=>x.startsWith("--min-sources="));
  const minSources=flag?Number(flag.split("=")[1]):1;
  const entries=loadForensicRoot(resolve(rootArg));
  const profile=compileStyleProfile(entries,{minSources});
  writeFileSync(resolve(outArg),JSON.stringify(profile,null,2)+"\n");
  process.stdout.write(JSON.stringify({ok:true,sources:profile.source_count,competitors:profile.competitor_count,output:resolve(outArg)})+"\n");
}
