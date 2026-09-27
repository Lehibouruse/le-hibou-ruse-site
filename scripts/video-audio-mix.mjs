#!/usr/bin/env node
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

export const MIX_SCHEMA="HIBOU_AUDIO_MIX_V1";
const CONTROLLED_LICENSES=new Set([
  "owned","commissioned","cc0","public_domain","generated_local",
  "royalty_free_with_documented_license"
]);
function fail(m){throw new Error(m);}
function clamp(v,min,max){return Math.min(max,Math.max(min,Number(v)));}
function sha256(path){return createHash("sha256").update(readFileSync(path)).digest("hex");}
function run(bin,args){
  const r=spawnSync(bin,args,{encoding:"utf8",windowsHide:true,shell:false});
  if(r.status!==0) fail(String(r.stderr||r.stdout||`${bin} failed`).slice(-6000));
  return r;
}
function durationSeconds(path){
  const r=run("ffprobe",["-v","error","-show_entries","format=duration","-of","default=nw=1:nk=1",resolve(path)]);
  const d=Number(String(r.stdout||"").trim());
  if(!Number.isFinite(d)||d<=0) fail("cannot determine voice duration");
  return d;
}

export function validateMusicPolicy(music){
  if(!music?.reference) fail("global music reference missing");
  const license=String(music.license||"").toLowerCase();
  if(!CONTROLLED_LICENSES.has(license)) fail(`music license not controlled: ${license||"missing"}`);
  if(license==="royalty_free_with_documented_license"&&!String(music.license_evidence||"").trim()){
    fail("royalty-free music requires license_evidence");
  }
  return {
    reference:String(music.reference),
    license,
    license_evidence:String(music.license_evidence||""),
    level_db:clamp(music.level_db??-24,-40,-8),
    duck_threshold:clamp(music.duck_threshold??0.025,0.001,0.2),
    duck_ratio:clamp(music.duck_ratio??8,2,20),
    duck_attack_ms:clamp(music.duck_attack_ms??20,1,200),
    duck_release_ms:clamp(music.duck_release_ms??350,50,1500),
    fade_in_s:clamp(music.fade_in_s??0.8,0,5),
    fade_out_s:clamp(music.fade_out_s??1.2,0,5)
  };
}

export function buildMusicMixPlan({voice,music,duration_s}){
  const policy=validateMusicPolicy(music);
  const d=Number(duration_s);
  if(!Number.isFinite(d)||d<=0) fail("duration_s required");
  const fadeOutStart=Math.max(0,d-policy.fade_out_s);
  const musicFilters=[
    `volume=${policy.level_db}dB`,
    policy.fade_in_s>0?`afade=t=in:st=0:d=${policy.fade_in_s.toFixed(3)}`:"",
    policy.fade_out_s>0?`afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${policy.fade_out_s.toFixed(3)}`:"",
    `atrim=duration=${d.toFixed(3)}`
  ].filter(Boolean).join(",");
  const filter=[
    `[1:a]${musicFilters}[music]`,
    `[music][0:a]sidechaincompress=threshold=${policy.duck_threshold}:ratio=${policy.duck_ratio}:attack=${policy.duck_attack_ms}:release=${policy.duck_release_ms}[ducked]`,
    `[0:a][ducked]amix=inputs=2:duration=first:dropout_transition=0:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=7[outa]`
  ].join(";");
  return {
    schema:MIX_SCHEMA,
    voice:resolve(voice),
    music:resolve(policy.reference),
    duration_s:d,
    policy,
    filter_complex:filter,
    output_label:"[outa]",
    global_layer:true,
    paid_fallback:false,
    human_review_required:true,
    publication_authorized:false
  };
}

export function mixAudio(voice,musicConfig,output){
  const d=durationSeconds(voice);
  const plan=buildMusicMixPlan({voice,music:musicConfig,duration_s:d});
  mkdirSync(dirname(resolve(output)),{recursive:true});
  run("ffmpeg",[
    "-y","-hide_banner","-loglevel","error",
    "-i",resolve(voice),"-stream_loop","-1","-i",plan.music,
    "-filter_complex",plan.filter_complex,
    "-map",plan.output_label,"-ar","48000","-ac","2","-c:a","pcm_s24le",
    resolve(output)
  ]);
  const result={
    ...plan,
    output:resolve(output),
    voice_sha256:sha256(resolve(voice)),
    music_sha256:sha256(plan.music),
    output_sha256:sha256(resolve(output))
  };
  writeFileSync(resolve(output)+".manifest.json",JSON.stringify(result,null,2)+"\n","utf8");
  return result;
}

if(import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [voice,configPath,output]=process.argv.slice(2);
  if(!voice||!configPath||!output) fail("usage: video-audio-mix.mjs voice.wav music-config.json output.wav");
  const config=JSON.parse(readFileSync(resolve(configPath),"utf8"));
  process.stdout.write(JSON.stringify(mixAudio(voice,config,output))+"\n");
}
