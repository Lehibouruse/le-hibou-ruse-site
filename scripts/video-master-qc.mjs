#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";

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
 return [...r.stderr.matchAll(/silence_(start|end):\s*([0-9.]+)/g)].map(m=>({kind:m[1],t:Number(m[2])}));
}
function loudness(path){
 const r=exec("ffmpeg",["-hide_banner","-nostats","-i",path,"-af","loudnorm=I=-16:TP=-1.5:LRA=7:print_format=json","-vn","-f","null","-"]);
 const blocks=[...r.stderr.matchAll(/\{\s*"input_i"[\s\S]*?\}/g)]; return blocks.length?JSON.parse(blocks.at(-1)[0]):null;
}
export function qcMaster(path){
 path=resolve(path); const p=probe(path); const video=p.streams.find(x=>x.codec_type==="video"), audio=p.streams.find(x=>x.codec_type==="audio");
 const blackLog=detects(path,"blackdetect=d=0.25:pix_th=0.02");
 const black=[...blackLog.matchAll(/black_start:([0-9.]+) black_end:([0-9.]+) black_duration:([0-9.]+)/g)].map(m=>({start:Number(m[1]),end:Number(m[2]),duration:Number(m[3])}));
 const sil=silence(path), loud=loudness(path);
 const checks={
  video_codec:video?.codec_name==="h264",
  audio_codec:audio?.codec_name==="aac",
  dimensions:video?.width===1080&&video?.height===1920,
  fps:video?.r_frame_rate==="30/1",
  duration_present:Number(p.format?.duration)>0,
  no_long_black:black.length===0,
  no_long_silence:sil.length===0,
  loudness_measured:Boolean(loud)
 };
 return {schema:"HIBOU_MASTER_QC_V2",file:path,sha256:sha256(path),duration_s:Number(p.format?.duration),size_bytes:Number(p.format?.size),streams:p.streams,black_intervals:black,silence_events:sil,loudness:loud,checks,status:Object.values(checks).every(Boolean)?"PASS":"REVIEW",paid_fallback:false};
}
if(import.meta.url===`file://${process.argv[1]}`){
 const [path,out]=process.argv.slice(2); if(!path) fail("usage: video-master-qc.mjs master.mp4 [qc.json]");
 const q=qcMaster(path); if(out) writeFileSync(resolve(out),JSON.stringify(q,null,2)); process.stdout.write(JSON.stringify(q)+"\n");
}
