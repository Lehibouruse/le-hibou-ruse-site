#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function fail(m){throw new Error(m);}
function exec(cmd,args){const r=spawnSync(cmd,args,{encoding:"utf8"});return {status:r.status,stdout:r.stdout||"",stderr:r.stderr||""};}
function sha256(path){return createHash("sha256").update(readFileSync(path)).digest("hex");}
function probe(path){
 const r=exec("ffprobe",["-v","error","-show_entries","format=duration,size:stream=codec_name,codec_type,width,height,r_frame_rate,sample_rate,channels","-of","json",path]);
 if(r.status!==0) fail(r.stderr); return JSON.parse(r.stdout);
}
function detects(path,filter){
 const r=exec("ffmpeg",["-hide_banner","-nostats","-i",path,"-vf",filter,"-an","-f","null","-"]);
 return r.stderr;
}
function silence(path){
 const r=exec("ffmpeg",["-hide_banner","-nostats","-i",path,"-af","silencedetect=noise=-45dB:d=0.8","-vn","-f","null","-"]);
 const events=[...r.stderr.matchAll(/silence_(start|end):\s*([0-9.]+)/g)].map(m=>({kind:m[1],t:Number(m[2])}));
 const intervals=[]; let open=null;
 for(const event of events){
  if(event.kind==="start") open=event.t;
  if(event.kind==="end"&&open!==null){intervals.push({start:open,end:event.t,duration:Number(event.t-open)});open=null;}
 }
 return {events,intervals};
}
function freezes(path){
 const log=detects(path,"freezedetect=n=-50dB:d=1.25");
 const starts=[...log.matchAll(/freeze_start:\s*([0-9.]+)/g)].map(m=>Number(m[1]));
 const durations=[...log.matchAll(/freeze_duration:\s*([0-9.]+)/g)].map(m=>Number(m[1]));
 return starts.map((start,index)=>({start,duration:durations[index]??null}));
}
function renderManifest(path){
 const manifest=path+".manifest.json";
 if(!existsSync(manifest)) return null;
 try{return JSON.parse(readFileSync(manifest,"utf8"));}catch{return null;}
}
function loudness(path){
 const r=exec("ffmpeg",["-hide_banner","-nostats","-i",path,"-af","loudnorm=I=-16:TP=-1.5:LRA=7:print_format=json","-vn","-f","null","-"]);
 const blocks=[...r.stderr.matchAll(/\{\s*"input_i"[\s\S]*?\}/g)]; return blocks.length?JSON.parse(blocks.at(-1)[0]):null;
}
export function qcMaster(path){
 path=resolve(path); const p=probe(path); const video=p.streams.find(x=>x.codec_type==="video"), audio=p.streams.find(x=>x.codec_type==="audio");
 const blackLog=detects(path,"blackdetect=d=0.25:pix_th=0.02");
 const black=[...blackLog.matchAll(/black_start:([0-9.]+) black_end:([0-9.]+) black_duration:([0-9.]+)/g)].map(m=>({start:Number(m[1]),end:Number(m[2]),duration:Number(m[3])}));
 const sil=silence(path), loud=loudness(path), frozen=freezes(path), manifest=renderManifest(path);
 const duration=Number(p.format?.duration);
 const expectedDuration=manifest?.scenes?.reduce((sum,scene)=>sum+Number(scene.planned_duration_s||0),0)??null;
 const durationDelta=Number.isFinite(expectedDuration)?Math.abs(duration-expectedDuration):null;
 const durationTolerance=Number.isFinite(expectedDuration)?Math.max(0.40,expectedDuration*0.03):null;
 const integrated=Number(loud?.input_i), truePeak=Number(loud?.input_tp);
 const maxSilence=sil.intervals.reduce((m,x)=>Math.max(m,Number(x.duration||0)),0);
 const maxFreeze=frozen.reduce((m,x)=>Math.max(m,Number(x.duration||0)),0);
 const subtitlesExpected=Boolean(manifest?.subtitles?.burn_in);
 const subtitlesBurned=manifest?.qc?.technical?.subtitles_burned_in;
 const checks={
  video_codec:video?.codec_name==="h264",
  audio_codec:audio?.codec_name==="aac",
  dimensions:video?.width===1080&&video?.height===1920,
  fps:video?.r_frame_rate==="30/1",
  duration_present:duration>0,
  duration_matches_contract:durationDelta===null||durationDelta<=durationTolerance,
  no_long_black:black.length===0,
  no_excessive_silence:maxSilence<=2.5,
  no_excessive_freeze:maxFreeze<=3.0,
  loudness_in_target:Number.isFinite(integrated)&&integrated>=-18&&integrated<=-14,
  true_peak_safe:Number.isFinite(truePeak)&&truePeak<=-0.5,
  subtitles_burned_when_expected:!subtitlesExpected||subtitlesBurned===true
 };
 const warnings=[];
 if(maxSilence>1.5) warnings.push("long_pause");
 if(maxFreeze>1.75) warnings.push("long_visual_freeze");
 if(Number.isFinite(truePeak)&&truePeak>-1.0) warnings.push("true_peak_close_to_ceiling");
 return {
  schema:"HIBOU_MASTER_QC_V3",file:path,sha256:sha256(path),duration_s:duration,size_bytes:Number(p.format?.size),
  expected_duration_s:expectedDuration,duration_delta_s:durationDelta,streams:p.streams,
  black_intervals:black,freeze_intervals:frozen,silence_events:sil.events,silence_intervals:sil.intervals,
  max_silence_s:maxSilence,max_freeze_s:maxFreeze,loudness:loud,warnings,checks,
  status:Object.values(checks).every(Boolean)?"PASS":"REVIEW",paid_fallback:false
 };
}
if(import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [path,out]=process.argv.slice(2); if(!path) fail("usage: video-master-qc.mjs master.mp4 [qc.json]");
 const q=qcMaster(path); if(out) writeFileSync(resolve(out),JSON.stringify(q,null,2)); process.stdout.write(JSON.stringify(q)+"\n");
}
