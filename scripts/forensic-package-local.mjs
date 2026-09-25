#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

function fail(message){ throw new Error(message); }
function sha256(path){ return createHash("sha256").update(readFileSync(path)).digest("hex"); }
function run(command,args,{encoding="utf8"}={}){
  const r=spawnSync(command,args,{encoding,windowsHide:true,shell:false,maxBuffer:32*1024*1024});
  if(r.status!==0) fail(`${command} failed (${r.status}): ${String(r.stderr||r.stdout||"").slice(-4000)}`);
  return r;
}
function median(values){
  if(!values.length) return null;
  const s=[...values].sort((a,b)=>a-b), m=Math.floor(s.length/2);
  return s.length%2?s[m]:(s[m-1]+s[m])/2;
}
export function parseSceneTimes(stderr){
  const out=[];
  for(const line of String(stderr||"").split(/\r?\n/)){
    const m=line.match(/pts_time:([0-9.]+)/);
    if(m){ const t=Number(m[1]); if(Number.isFinite(t)&&(!out.length||Math.abs(t-out.at(-1))>0.12)) out.push(t); }
  }
  return out;
}
export function parseVolumeDetect(stderr){
  const text=String(stderr||"");
  const mean=Number(text.match(/mean_volume:\s*(-?[0-9.]+) dB/)?.[1]);
  const max=Number(text.match(/max_volume:\s*(-?[0-9.]+) dB/)?.[1]);
  return {mean_db:Number.isFinite(mean)?mean:null,max_db:Number.isFinite(max)?max:null};
}
export function parseSilence(stderr){
  const starts=[], segments=[];
  for(const line of String(stderr||"").split(/\r?\n/)){
    const s=line.match(/silence_start:\s*([0-9.]+)/);
    if(s){ starts.push(Number(s[1])); continue; }
    const e=line.match(/silence_end:\s*([0-9.]+).*silence_duration:\s*([0-9.]+)/);
    if(e){
      const start=starts.length?starts.shift():Math.max(0,Number(e[1])-Number(e[2]));
      segments.push({start,end:Number(e[1]),duration:Number(e[2])});
    }
  }
  return segments.filter(x=>[x.start,x.end,x.duration].every(Number.isFinite));
}
export function chooseFrameTimes(duration,sceneTimes,{maxFrames=20}={}){
  const clean=[0.1,...sceneTimes.map(x=>Math.min(duration-0.05,Math.max(0.05,x+0.05)))]
    .filter(x=>Number.isFinite(x)&&x>=0&&x<duration);
  const unique=[...new Set(clean.map(x=>Math.round(x*100)/100))];
  if(unique.length>=Math.min(3,maxFrames)) return unique.slice(0,maxFrames);
  const count=Math.min(maxFrames,Math.max(3,Math.ceil(duration/2)));
  const step=duration/(count+1);
  return [...new Set([...unique,...Array.from({length:count},(_,i)=>Math.round(step*(i+1)*100)/100)])]
    .filter(x=>x>0&&x<duration).sort((a,b)=>a-b).slice(0,maxFrames);
}
function ffprobe(input){
  const r=run("ffprobe",["-v","error","-print_format","json","-show_format","-show_streams",input]);
  const data=JSON.parse(r.stdout);
  const video=(data.streams||[]).find(x=>x.codec_type==="video")||{};
  const audio=(data.streams||[]).find(x=>x.codec_type==="audio")||{};
  const duration=Number(data.format?.duration||video.duration||audio.duration||0);
  return {
    duration_s:Number.isFinite(duration)?duration:0,
    format_name:data.format?.format_name||"",
    size_bytes:Number(data.format?.size||0)||statSync(input).size,
    bitrate:Number(data.format?.bit_rate||0)||null,
    video:{codec:video.codec_name||"",width:video.width||null,height:video.height||null,fps:video.avg_frame_rate||video.r_frame_rate||null},
    audio:{codec:audio.codec_name||"",sample_rate:Number(audio.sample_rate||0)||null,channels:audio.channels||null},
  };
}
function detectScenes(input,{threshold=0.30}={}){
  const safeThreshold=Math.min(0.99,Math.max(0.01,Number(threshold)||0.30));
  const r=spawnSync("ffmpeg",["-hide_banner","-i",input,"-vf",`select='gt(scene,${safeThreshold.toFixed(2)})',showinfo`,"-an","-f","null","-"],{
    encoding:"utf8",windowsHide:true,shell:false,maxBuffer:32*1024*1024
  });
  if(![0,1].includes(r.status)) fail("ffmpeg scene detection failed: "+String(r.stderr||"").slice(-3000));
  return parseSceneTimes(r.stderr);
}
function extractAudio(input,path){
  run("ffmpeg",["-y","-hide_banner","-loglevel","error","-i",input,"-vn","-ac","1","-ar","16000","-c:a","pcm_s16le",path]);
}
function audioMetrics(wav,duration){
  const volume=spawnSync("ffmpeg",["-hide_banner","-i",wav,"-af","volumedetect","-f","null","-"],{encoding:"utf8",windowsHide:true,shell:false,maxBuffer:16*1024*1024});
  const silence=spawnSync("ffmpeg",["-hide_banner","-i",wav,"-af","silencedetect=n=-35dB:d=0.25","-f","null","-"],{encoding:"utf8",windowsHide:true,shell:false,maxBuffer:16*1024*1024});
  const segments=parseSilence(silence.stderr);
  const silence_s=segments.reduce((s,x)=>s+x.duration,0);
  return {
    schema:"HIBOU_FORENSIC_VOICE_METRICS_V1",
    ...parseVolumeDetect(volume.stderr),
    silence_threshold_db:-35,
    silence_min_duration_s:0.25,
    silence_segments:segments,
    silence_s:Math.round(silence_s*1000)/1000,
    silence_ratio:duration?Math.round(Math.min(1,silence_s/duration)*10000)/10000:null,
    speaking_ratio:duration?Math.round(Math.max(0,1-silence_s/duration)*10000)/10000:null,
  };
}
function extractFrames(input,dir,times){
  mkdirSync(dir,{recursive:true});
  const frames=[];
  for(let i=0;i<times.length;i++){
    const path=resolve(dir,`frame-${String(i+1).padStart(2,"0")}-${times[i].toFixed(2)}s.jpg`);
    run("ffmpeg",["-y","-hide_banner","-loglevel","error","-ss",String(times[i]),"-i",input,"-frames:v","1","-q:v","2",path]);
    frames.push({file:basename(path),time_s:times[i],bytes:statSync(path).size,sha256:sha256(path)});
  }
  return frames;
}
function transcribeOptional(wav,outDir){
  const python=String(process.env.HIBOU_FORENSIC_PYTHON||"").trim();
  if(!python) return {status:"not_run",reason:"HIBOU_FORENSIC_PYTHON_not_set",paid_fallback:false};
  const script=resolve("scripts/forensic-transcribe-local.py");
  const out=resolve(outDir,"transcript.json");
  const r=spawnSync(python,[script,wav,out],{encoding:"utf8",windowsHide:true,shell:false,maxBuffer:16*1024*1024});
  if(r.status!==0) return {status:"unavailable",reason:String(r.stderr||r.stdout||"").slice(-3000),paid_fallback:false};
  return JSON.parse(readFileSync(out,"utf8"));
}
function writeJson(path,value){ writeFileSync(path,JSON.stringify(value,null,2)+"\n",{encoding:"utf8",mode:0o600}); }
function artifact(path,root){ return {file:basename(path),bytes:statSync(path).size,sha256:sha256(path)}; }

export function intervalStats(duration,eventTimes){
  const boundaries=[0,...eventTimes.filter(x=>x>0&&x<duration),duration].sort((a,b)=>a-b);
  const intervals=boundaries.slice(1).map((x,i)=>x-boundaries[i]).filter(x=>x>0.01);
  return {
    event_count:eventTimes.length,
    mean_interval_s:intervals.length?Math.round(intervals.reduce((a,b)=>a+b,0)/intervals.length*1000)/1000:null,
    median_interval_s:intervals.length?Math.round(median(intervals)*1000)/1000:null,
    intervals_s:intervals.map(x=>Math.round(x*1000)/1000)
  };
}
export function attentionMetrics(duration,eventTimes,{threshold=0.12}={}){
  const s=intervalStats(duration,eventTimes);
  return {
    schema:"HIBOU_FORENSIC_ATTENTION_PROXY_V1",
    method:"ffmpeg_scene_score_sensitive_proxy",
    threshold:Number(threshold),
    proxy_only:true,
    event_count:s.event_count,
    event_times_s:eventTimes,
    event_interval_s:s.median_interval_s,
    mean_event_interval_s:s.mean_interval_s,
    intervals_s:s.intervals_s
  };
}
export function transcriptPace(transcript,duration){
  if(transcript?.status!=="ok") return {word_count:null,words_per_minute:null,words_per_minute_speaking_time:null,speaking_time_s:null};
  const text=String(transcript.text||"").trim();
  const wordCount=text?text.split(/\s+/).filter(Boolean).length:0;
  const segments=Array.isArray(transcript.segments)?transcript.segments:[];
  const speakingTime=segments.reduce((sum,s)=>sum+Math.max(0,Number(s.end||0)-Number(s.start||0)),0);
  return {
    word_count:wordCount,
    words_per_minute:duration>0?Math.round((wordCount/duration*60)*10)/10:null,
    words_per_minute_speaking_time:speakingTime>0?Math.round((wordCount/speakingTime*60)*10)/10:null,
    speaking_time_s:Math.round(speakingTime*1000)/1000
  };
}

export function sceneMetrics(duration,cutTimes){
  const boundaries=[0,...cutTimes.filter(x=>x>0&&x<duration),duration].sort((a,b)=>a-b);
  const intervals=boundaries.slice(1).map((x,i)=>x-boundaries[i]).filter(x=>x>0.01);
  return {
    schema:"HIBOU_FORENSIC_SCENE_METRICS_V1",
    threshold:0.30,
    cut_count:cutTimes.length,
    cut_times_s:cutTimes,
    scene_count:Math.max(1,intervals.length),
    mean_scene_duration_s:intervals.length?Math.round(intervals.reduce((a,b)=>a+b,0)/intervals.length*1000)/1000:null,
    median_scene_duration_s:intervals.length?Math.round(median(intervals)*1000)/1000:null,
    composition_change_interval_s:intervals.length?Math.round(median(intervals)*1000)/1000:null,
    intervals_s:intervals.map(x=>Math.round(x*1000)/1000),
  };
}

export function buildManifest({input,media,scene,voice,attention,frames,transcript,artifacts}){
  return {
    schema:"HIBOU_FORENSIC_PACKAGE_V1",
    generated_at:new Date().toISOString(),
    input:{file:basename(input),bytes:statSync(input).size,sha256:sha256(input)},
    media,scene,voice,attention,frames,transcript,
    artifacts,
    network_used:false,
    paid_api_used:false,
    source_deleted:false,
  };
}

async function main(){
  const [inputArg,outArg]=process.argv.slice(2);
  if(!inputArg||!outArg) fail("usage: forensic-package-local.mjs <video> <output_dir>");
  const input=resolve(inputArg), out=resolve(outArg);
  if(!existsSync(input)) fail("video introuvable");
  if(![".mp4",".mov",".mkv",".webm"].includes(extname(input).toLowerCase())) fail("format vidéo refusé");
  mkdirSync(out,{recursive:true});
  const media=ffprobe(input);
  if(!(media.duration_s>0)) fail("durée vidéo invalide");
  const cuts=detectScenes(input,{threshold:0.30});
  const attentionEvents=detectScenes(input,{threshold:0.12});
  const scene=sceneMetrics(media.duration_s,cuts);
  const attention=attentionMetrics(media.duration_s,attentionEvents,{threshold:0.12});
  const wav=resolve(out,"audio.wav");
  extractAudio(input,wav);
  const voice=audioMetrics(wav,media.duration_s);
  const frameTimes=chooseFrameTimes(media.duration_s,cuts);
  const frames=extractFrames(input,resolve(out,"frames"),frameTimes);
  const transcript=transcribeOptional(wav,out);
  Object.assign(voice,transcriptPace(transcript,media.duration_s));
  writeJson(resolve(out,"media.json"),media);
  writeJson(resolve(out,"scene_metrics.json"),scene);
  writeJson(resolve(out,"voice_metrics.json"),voice);
  writeJson(resolve(out,"attention_metrics.json"),attention);
  writeJson(resolve(out,"frames.json"),frames);
  const artifacts=[
    artifact(resolve(out,"media.json"),out),
    artifact(resolve(out,"scene_metrics.json"),out),
    artifact(resolve(out,"voice_metrics.json"),out),
    artifact(resolve(out,"attention_metrics.json"),out),
    artifact(resolve(out,"frames.json"),out),
    artifact(wav,out),
  ];
  if(existsSync(resolve(out,"transcript.json"))) artifacts.push(artifact(resolve(out,"transcript.json"),out));
  const manifest=buildManifest({input,media,scene,voice,attention,frames,transcript,artifacts});
  writeJson(resolve(out,"manifest.json"),manifest);
  process.stdout.write(JSON.stringify({ok:true,output_dir:out,manifest:resolve(out,"manifest.json"),cut_count:scene.cut_count,attention_events:attention.event_count,frames:frames.length,transcript_status:transcript.status||"ok"},null,2)+"\n");
}
if(import.meta.url===`file://${process.argv[1]}`) main().catch(e=>{console.error(String(e?.stack||e));process.exitCode=1;});
