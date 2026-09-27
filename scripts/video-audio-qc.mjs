#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

function fail(message){ throw new Error(message); }
function sha256(path){ return createHash("sha256").update(readFileSync(path)).digest("hex"); }
function exec(command,args){
  const r=spawnSync(command,args,{encoding:"utf8",windowsHide:true,shell:false,maxBuffer:16*1024*1024});
  if(r.status!==0) fail(String(r.stderr||r.stdout||`${command} failed`).slice(-5000));
  return {stdout:String(r.stdout||""),stderr:String(r.stderr||"")};
}
function probe(path){
  const r=exec("ffprobe",[
    "-v","error",
    "-show_entries","format=duration,size:stream=codec_name,codec_type,sample_rate,channels,duration",
    "-of","json",path
  ]);
  return JSON.parse(r.stdout);
}
function loudness(path){
  const r=exec("ffmpeg",[
    "-hide_banner","-nostats","-i",path,
    "-af","loudnorm=I=-16:TP=-1.5:LRA=7:print_format=json",
    "-vn","-f","null","-"
  ]);
  const blocks=[...r.stderr.matchAll(/\{\s*"input_i"[\s\S]*?\}/g)];
  return blocks.length?JSON.parse(blocks.at(-1)[0]):null;
}
function silence(path){
  const r=exec("ffmpeg",[
    "-hide_banner","-nostats","-i",path,
    "-af","silencedetect=noise=-45dB:d=0.8",
    "-vn","-f","null","-"
  ]);
  const events=[...r.stderr.matchAll(/silence_(start|end):\s*([0-9.]+)/g)]
    .map(m=>({kind:m[1],t:Number(m[2])}));
  const intervals=[];
  let open=null;
  for(const event of events){
    if(event.kind==="start") open=event.t;
    if(event.kind==="end"&&open!==null){
      intervals.push({start:open,end:event.t,duration_s:event.t-open});
      open=null;
    }
  }
  return {events,intervals};
}
function expectedFromContract(contractPath){
  if(!contractPath||!existsSync(resolve(contractPath))) return null;
  const contract=JSON.parse(readFileSync(resolve(contractPath),"utf8"));
  const scenes=Array.isArray(contract.scenes)?contract.scenes:[];
  const duration=scenes.reduce((sum,scene)=>sum+Number(scene.planned_duration_s||0),0);
  const narration=scenes.map(scene=>String(scene.narration_text||scene.breath_unit||scene.narration_exact?.text||"")).join(" ").trim();
  const words=narration?narration.split(/\s+/).filter(Boolean).length:0;
  return {duration_s:duration,word_count:words,scene_count:scenes.length};
}
export function qcAudio(audioPath,{contractPath=""}={}){
  const path=resolve(audioPath);
  if(!existsSync(path)) fail("audio file missing: "+path);
  const p=probe(path);
  const audio=p.streams?.find(stream=>stream.codec_type==="audio");
  if(!audio) fail("audio stream missing");
  const duration=Number(p.format?.duration||audio.duration||0);
  const loud=loudness(path);
  const sil=silence(path);
  const expected=expectedFromContract(contractPath);
  const integrated=Number(loud?.input_i);
  const peak=Number(loud?.input_tp);
  const maxSilence=sil.intervals.reduce((m,x)=>Math.max(m,Number(x.duration_s||0)),0);
  const silenceTotal=sil.intervals.reduce((s,x)=>s+Number(x.duration_s||0),0);
  const durationTolerance=expected?Math.max(0.40,expected.duration_s*0.03):null;
  const durationDelta=expected?Math.abs(duration-expected.duration_s):null;
  const wpm=expected&&duration>0?expected.word_count/(duration/60):null;
  const checks={
    duration_present:duration>0,
    sample_rate:Number(audio.sample_rate)===48000,
    channels:Number(audio.channels)===2,
    loudness_in_target:Number.isFinite(integrated)&&integrated>=-18&&integrated<=-14,
    true_peak_safe:Number.isFinite(peak)&&peak<=-0.5,
    no_excessive_silence:maxSilence<=2.5,
    duration_matches_contract:expected?durationDelta<=durationTolerance:true,
    speech_rate_plausible:wpm===null||(wpm>=90&&wpm<=230)
  };
  const warnings=[];
  if(maxSilence>1.5) warnings.push("long_pause");
  if(wpm!==null&&(wpm<115||wpm>200)) warnings.push("speech_rate_outside_preferred_band");
  if(Number.isFinite(peak)&&peak>-1.0) warnings.push("true_peak_close_to_ceiling");
  return {
    schema:"HIBOU_AUDIO_QC_V1",
    file:path,
    sha256:sha256(path),
    duration_s:duration,
    size_bytes:Number(p.format?.size||0),
    stream:audio,
    expected,
    duration_delta_s:durationDelta,
    words_per_minute:wpm,
    loudness:loud,
    silence_intervals:sil.intervals,
    silence_total_s:silenceTotal,
    silence_ratio:duration>0?silenceTotal/duration:null,
    max_silence_s:maxSilence,
    checks,
    warnings,
    status:Object.values(checks).every(Boolean)?"PASS":"REVIEW",
    paid_fallback:false
  };
}
if(import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [audioPath,outPath,contractPath=""]=process.argv.slice(2);
  if(!audioPath) fail("usage: video-audio-qc.mjs audio.wav [qc.json] [contract.json]");
  const result=qcAudio(audioPath,{contractPath});
  if(outPath) writeFileSync(resolve(outPath),JSON.stringify(result,null,2)+"\n");
  process.stdout.write(JSON.stringify(result)+"\n");
}
