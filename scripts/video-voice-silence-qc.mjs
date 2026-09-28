#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const VOICE_SILENCE_QC_SCHEMA = "HIBOU_VOICE_SILENCE_QC_V1";
export const DEFAULT_MAX_SILENCE_S = 0.8;
export const DEFAULT_NOISE_DB = -45;

function fail(message){ throw new Error(message); }
function clamp(value,min,max){ return Math.min(max,Math.max(min,Number(value))); }
function sha256File(path){ return createHash("sha256").update(readFileSync(path)).digest("hex"); }

export function parseSilenceDetect(stderr,{mediaDurationS=null}={}){
  const text=String(stderr||"");
  const events=[...text.matchAll(/silence_(start|end):\s*([0-9.]+)/g)]
    .map(match=>({kind:match[1],t:Number(match[2])}))
    .filter(event=>Number.isFinite(event.t));

  const intervals=[];
  let open=null;
  for(const event of events){
    if(event.kind==="start"){
      open=event.t;
      continue;
    }
    if(event.kind==="end" && open!==null){
      const end=Math.max(open,event.t);
      intervals.push({
        start_s:Number(open.toFixed(6)),
        end_s:Number(end.toFixed(6)),
        duration_s:Number((end-open).toFixed(6)),
      });
      open=null;
    }
  }
  if(open!==null && Number.isFinite(Number(mediaDurationS))){
    const end=Math.max(open,Number(mediaDurationS));
    intervals.push({
      start_s:Number(open.toFixed(6)),
      end_s:Number(end.toFixed(6)),
      duration_s:Number((end-open).toFixed(6)),
    });
  }
  return {events,intervals,open_silence_start_s:open};
}

export function evaluateVoiceSilence({
  intervals=[],
  maxSilenceS=DEFAULT_MAX_SILENCE_S,
  mediaDurationS=null,
}={}){
  const threshold=clamp(maxSilenceS,0.25,5);
  const normalized=(Array.isArray(intervals)?intervals:[])
    .map(interval=>({
      start_s:Number(interval?.start_s),
      end_s:Number(interval?.end_s),
      duration_s:Number(interval?.duration_s),
    }))
    .filter(interval=>
      Number.isFinite(interval.start_s)
      && Number.isFinite(interval.end_s)
      && Number.isFinite(interval.duration_s)
      && interval.duration_s>=0
    );
  const rejected=normalized.filter(interval=>interval.duration_s>=threshold);
  const longest=normalized.reduce((max,interval)=>Math.max(max,interval.duration_s),0);
  const total=normalized.reduce((sum,interval)=>sum+interval.duration_s,0);
  return {
    status:rejected.length?"REJECT":"PASS",
    max_silence_s:threshold,
    media_duration_s:Number.isFinite(Number(mediaDurationS))?Number(mediaDurationS):null,
    interval_count:normalized.length,
    rejected_interval_count:rejected.length,
    rejected_intervals:rejected,
    longest_silence_s:Number(longest.toFixed(6)),
    total_detected_silence_s:Number(total.toFixed(6)),
    policy:{
      matches_master_qc_long_silence_gate:true,
      block_before_images:true,
      automatic_audio_repair:false,
      publication_authorized:false,
    },
  };
}

function command(bin,args){
  const result=spawnSync(bin,args,{
    encoding:"utf8",
    windowsHide:true,
    shell:false,
    maxBuffer:8*1024*1024,
  });
  return {
    status:result.status,
    stdout:String(result.stdout||""),
    stderr:String(result.stderr||""),
    error:result.error?String(result.error.message||result.error):null,
  };
}

function mediaDuration(path){
  const r=command("ffprobe",[
    "-v","error",
    "-show_entries","format=duration",
    "-of","default=noprint_wrappers=1:nokey=1",
    path,
  ]);
  if(r.error || r.status!==0) fail("ffprobe voice silence QC failed: "+(r.error||r.stderr||r.status));
  const duration=Number(r.stdout.trim());
  if(!Number.isFinite(duration)||duration<=0) fail("invalid audio duration from ffprobe");
  return duration;
}

export function auditVoiceSilence(path,{
  maxSilenceS=DEFAULT_MAX_SILENCE_S,
  noiseDb=DEFAULT_NOISE_DB,
}={}){
  const resolved=resolve(path);
  if(!existsSync(resolved)) fail("voice mastered audio missing: "+resolved);
  const duration=mediaDuration(resolved);
  const threshold=clamp(maxSilenceS,0.25,5);
  const noise=clamp(noiseDb,-90,-10);
  const r=command("ffmpeg",[
    "-hide_banner","-nostats",
    "-i",resolved,
    "-af",`silencedetect=noise=${noise}dB:d=${threshold}`,
    "-vn","-f","null","-",
  ]);
  if(r.error || (r.status!==0 && r.status!==1)){
    fail("ffmpeg voice silence QC failed: "+(r.error||r.stderr||r.status));
  }
  const parsed=parseSilenceDetect(r.stderr,{mediaDurationS:duration});
  return {
    schema:VOICE_SILENCE_QC_SCHEMA,
    file:resolved,
    sha256:sha256File(resolved),
    noise_db:noise,
    ...evaluateVoiceSilence({
      intervals:parsed.intervals,
      maxSilenceS:threshold,
      mediaDurationS:duration,
    }),
    raw_event_count:parsed.events.length,
  };
}

if(import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [input,output]=process.argv.slice(2).filter(arg=>!arg.startsWith("--"));
  if(!input||!output){
    fail("usage: node scripts/video-voice-silence-qc.mjs voice-mastered.wav voice-silence-qc.json [--max-silence=0.8] [--noise-db=-45]");
  }
  const maxArg=process.argv.find(arg=>arg.startsWith("--max-silence="));
  const noiseArg=process.argv.find(arg=>arg.startsWith("--noise-db="));
  const report=auditVoiceSilence(input,{
    maxSilenceS:maxArg?Number(maxArg.slice("--max-silence=".length)):DEFAULT_MAX_SILENCE_S,
    noiseDb:noiseArg?Number(noiseArg.slice("--noise-db=".length)):DEFAULT_NOISE_DB,
  });
  writeFileSync(resolve(output),JSON.stringify(report,null,2)+"\n","utf8");
  process.stdout.write(JSON.stringify({
    ok:report.status==="PASS",
    schema:report.schema,
    status:report.status,
    longest_silence_s:report.longest_silence_s,
    rejected_interval_count:report.rejected_interval_count,
    output:resolve(output),
  })+"\n");
  if(report.status!=="PASS") process.exitCode=2;
}
