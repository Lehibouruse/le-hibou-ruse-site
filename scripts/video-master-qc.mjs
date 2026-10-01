#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { plannedAttentionBeatTimes, visualEventMetrics } from "./video-visual-event-metrics.mjs";

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
function sceneEventTimes(path,threshold){
 const safe=Math.min(0.99,Math.max(0.01,Number(threshold)||0.12));
 const r=exec("ffmpeg",["-hide_banner","-nostats","-i",path,"-vf",`select='gt(scene,${safe.toFixed(2)})',showinfo`,"-an","-f","null","-"]);
 const out=[];
 for(const line of String(r.stderr||"").split(/\r?\n/)){
   const m=line.match(/pts_time:([0-9.]+)/);
   if(!m) continue;
   const t=Number(m[1]);
   if(Number.isFinite(t)&&(!out.length||Math.abs(t-out.at(-1))>0.08)) out.push(t);
 }
 return out;
}
export function creativeMasterReview({contract=null,visualEventRate=null}={}){
 const reasons=[];
 if(!contract){
   return {status:"NOT_EVALUATED",reasons,metrics:{contract_present:false}};
 }
 const scenes=Array.isArray(contract?.scenes)?contract.scenes:[];
 const voiceRuntime=contract?.audio?.voice_profile_runtime||null;
 const voiceIdentityLocked=voiceRuntime?.identity_lock_enabled===true;
 const voiceReferenceReady=Boolean(
   voiceRuntime?.audio_reference_present
   || voiceRuntime?.bootstrap_reference_sha256
   || contract?.audio?.audio_prompt_sha256
 );
 if(!voiceIdentityLocked) reasons.push({code:"voice_identity_lock_missing"});
 if(voiceIdentityLocked&&!voiceReferenceReady) reasons.push({code:"voice_identity_reference_missing"});
 const motionScenes=scenes.filter(scene=>{
   const hasSpecificCamera=Array.isArray(scene?.timeline?.events)
     && scene.timeline.events.some(event=>String(event?.type||"").toLowerCase()==="camera");
   const source=String(scene?.composition?.camera_transform?.source||"");
   return hasSpecificCamera||source==="global_fallback_micro_motion_v2";
 });
 const motionCoverageRatio=scenes.length?motionScenes.length/scenes.length:0;
 if(scenes.length&&motionCoverageRatio<0.6){
   reasons.push({code:"motion_contract_coverage_low",coverage_ratio:Number(motionCoverageRatio.toFixed(3))});
 }
 const hibouScenes=scenes.filter(scene=>scene?.framing?.hibou===true);
 const missingHibouLayers=hibouScenes
   .filter(scene=>!scene?.composition?.character_pose)
   .map(scene=>scene.scene_id);
 if(missingHibouLayers.length){
   reasons.push({code:"hibou_layer_missing",scene_ids:missingHibouLayers});
 }
 const emptyMotionThirds=Array.isArray(visualEventRate?.thirds)
   ?visualEventRate.thirds.filter(third=>Number(third?.subtle_event_count||0)===0&&Number(third?.planned_attention_beat_count||0)===0).length
   :0;
 if(motionCoverageRatio<0.6&&emptyMotionThirds>=2){
   reasons.push({code:"subtle_motion_proxy_sparse",empty_thirds:emptyMotionThirds});
 }
 return {
   status:reasons.length?"REVIEW":"PASS",
   reasons,
   metrics:{
     contract_present:true,
     scene_count:scenes.length,
     motion_scene_count:motionScenes.length,
     motion_coverage_ratio:Number(motionCoverageRatio.toFixed(3)),
     voice_identity_locked:voiceIdentityLocked,
     voice_reference_ready:voiceReferenceReady,
     hibou_scene_count:hibouScenes.length,
     missing_hibou_layer_count:missingHibouLayers.length,
     empty_motion_thirds:emptyMotionThirds,
   }
 };
}
export function qcMaster(path,{contract=null}={}){
 path=resolve(path); const p=probe(path); const video=p.streams.find(x=>x.codec_type==="video"), audio=p.streams.find(x=>x.codec_type==="audio");
 const blackLog=detects(path,"blackdetect=d=0.25:pix_th=0.02");
 const black=[...blackLog.matchAll(/black_start:([0-9.]+) black_end:([0-9.]+) black_duration:([0-9.]+)/g)].map(m=>({start:Number(m[1]),end:Number(m[2]),duration:Number(m[3])}));
 const sil=silence(path), loud=loudness(path);
 const duration=Number(p.format?.duration);
 const hardCuts=sceneEventTimes(path,0.30);
 const sensitiveEvents=sceneEventTimes(path,0.12);
 const plannedBeats=contract?plannedAttentionBeatTimes(contract):[];
 const visual_event_rate=visualEventMetrics(duration,sensitiveEvents,hardCuts,{plannedAttentionBeatTimes:plannedBeats});
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
 const technicalStatus=Object.values(checks).every(Boolean)?"PASS":"REVIEW";
 const creative_review=creativeMasterReview({contract,visualEventRate:visual_event_rate});
 const status=technicalStatus==="PASS"&&(!contract||creative_review.status==="PASS")?"PASS":"REVIEW";
 return {schema:"HIBOU_MASTER_QC_V3",file:path,sha256:sha256(path),duration_s:duration,size_bytes:Number(p.format?.size),streams:p.streams,black_intervals:black,silence_events:sil,loudness:loud,visual_event_rate,checks,technical_status:technicalStatus,creative_review,status,paid_fallback:false};
}
if(import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [path,out,contractPath]=process.argv.slice(2); if(!path) fail("usage: video-master-qc.mjs master.mp4 [qc.json] [contract.json]");
 const contract=contractPath?JSON.parse(readFileSync(resolve(contractPath),"utf8")):null;
 const q=qcMaster(path,{contract}); if(out) writeFileSync(resolve(out),JSON.stringify(q,null,2)); process.stdout.write(JSON.stringify(q)+"\n");
}
