#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const POLICY_PATH=resolve("config/video-license-policy.json");
const INSTALLER_PATH=resolve("scripts/video-local-install-windows.ps1");

function fail(message){throw new Error(message);}
function policy(){return JSON.parse(readFileSync(POLICY_PATH,"utf8"));}
function clean(v){return String(v??"").trim().toLowerCase();}

export function classifyModelName(name,p=policy()){
  const value=clean(name);
  const blocked=(p.components||[]).find(x=>x.status==="blocked_for_commercial_pipeline" &&
    (x.blocked_name_patterns||[]).some(pattern=>value.includes(clean(pattern))));
  if(blocked) return {status:"BLOCK",reason:"noncommercial_model_family",component:blocked.id};
  const exact=(p.components||[]).find(x=>clean(x.artifact)===value || clean(x.id)===value);
  if(exact) return {status:String(exact.status).startsWith("approved")?"PASS":"REVIEW",reason:"known_component",component:exact.id};
  return {status:"BLOCK",reason:"unknown_model_license",component:null};
}

export function classifyFfmpegVersion(text){
  const raw=String(text||"");
  const lower=raw.toLowerCase();
  const nonfree=lower.includes("--enable-nonfree");
  const gpl=lower.includes("--enable-gpl");
  return {
    detected:Boolean(raw.trim()),
    build_license:nonfree?"nonfree_build_review_required":gpl?"GPL-2.0-or-later":"LGPL-2.1-or-later_or_build_specific",
    enable_gpl:gpl,
    enable_nonfree:nonfree,
    local_render_allowed:Boolean(raw.trim()),
    redistribution_status:nonfree?"BLOCK":gpl?"GPL_OBLIGATIONS":"LGPL_OR_BUILD_SPECIFIC_REVIEW"
  };
}

export function auditRepositoryLicensePins(p=policy(),installerText=readFileSync(INSTALLER_PATH,"utf8")){
  const flux=(p.components||[]).find(x=>x.id==="flux1-schnell-fp8");
  const chatter=(p.components||[]).find(x=>x.id==="chatterbox-tts-0.1.7");
  const comfy=(p.components||[]).find(x=>x.id==="comfyui");
  const faster=(p.components||[]).find(x=>x.id==="faster-whisper");
  const opencv=(p.components||[]).find(x=>x.id==="opencv-python-headless-4.14.0.94");
  if(!flux||!chatter||!comfy||!faster||!opencv) fail("required approved components absent from policy");
  const checks=[
    {id:"flux_artifact_url",ok:installerText.includes("Comfy-Org/flux1-schnell")},
    {id:"flux_hash_pin",ok:installerText.toLowerCase().includes(clean(flux.sha256))},
    {id:"chatterbox_version_pin",ok:installerText.includes('$ChatterboxVersion = "0.1.7"')},
    {id:"unknown_license_blocked",ok:p.gates?.unknown_model_license==="block"},
    {id:"noncommercial_blocked",ok:p.gates?.noncommercial_model_in_commercial_pipeline==="block"},
    {id:"voice_rights_blocked_when_unknown",ok:p.gates?.voice_reference_rights_unknown==="block"},
    {id:"custom_node_unknown_blocked",ok:p.gates?.custom_comfyui_node_license_unknown==="block"},
    {id:"comfyui_version_pin",ok:installerText.includes('$ComfyVersion = "0.37.0"') && comfy.version==="0.37.0"},
    {id:"faster_whisper_pin",ok:faster.version==="1.2.1"},
    {id:"opencv_pin",ok:opencv.version==="4.14.0.94"},
    {id:"forensic_unpinned_blocked",ok:p.gates?.unpinned_top_level_forensic_dependency==="block"}
  ];
  return {schema:"HIBOU_VIDEO_LICENSE_AUDIT_V1",checks,ok:checks.every(x=>x.ok)};
}

export function auditRuntime({ffmpegVersionText="",modelName="flux1-schnell-fp8.safetensors"}={}){
  const p=policy();
  const repo=auditRepositoryLicensePins(p);
  const model=classifyModelName(modelName,p);
  const ffmpeg=classifyFfmpegVersion(ffmpegVersionText);
  return {
    schema:"HIBOU_VIDEO_LICENSE_RUNTIME_AUDIT_V1",
    reviewed_at:p.reviewed_at,
    repository:repo,
    model,
    ffmpeg,
    local_production_allowed:repo.ok && model.status==="PASS" && ffmpeg.local_render_allowed,
    redistribution_allowed_without_further_review:false,
    legal_advice:false
  };
}

if(import.meta.url===`file://${process.argv[1]}`){
  const runtime=process.argv.includes("--runtime");
  if(!runtime){
    const result=auditRepositoryLicensePins();
    process.stdout.write(JSON.stringify(result,null,2)+"\n");
    if(!result.ok) process.exitCode=2;
  }else{
    const modelArg=process.argv.find(x=>x.startsWith("--model="))?.slice(8)||"flux1-schnell-fp8.safetensors";
    const r=spawnSync("ffmpeg",["-version"],{encoding:"utf8",windowsHide:true,shell:false});
    const result=auditRuntime({ffmpegVersionText:r.status===0?String(r.stdout||r.stderr||""):"",modelName:modelArg});
    process.stdout.write(JSON.stringify(result,null,2)+"\n");
    if(!result.local_production_allowed) process.exitCode=2;
  }
}
