#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import net from "node:net";
import { collectPreflight } from "./video-local-preflight.mjs";

const clean=(v)=>String(v??"").trim();

export function decideVideoNextStep({preflight,installState={},comfyRunning=false}={}){
  const reasons=preflight?.decision?.blocking_reasons||[];
  if(!preflight?.nvidia_smi_available || !(preflight?.gpus||[]).length){
    return {code:"FIX_GPU_DETECTION",command:"npm run video:gpu-check:windows",why:"GPU NVIDIA non détecté par nvidia-smi"};
  }
  if(reasons.includes("low_disk_space")){
    return {code:"FREE_DISK_SPACE",command:"npm run video:doctor:windows",why:"Espace disque sous le seuil Hibou"};
  }
  if(reasons.includes("python_3_11_missing") || reasons.includes("ffmpeg_missing")){
    return {code:"INSTALL_LOCAL_PREREQUISITES",command:"npm run video:install:windows",why:"Python 3.11 ou FFmpeg manque"};
  }
  const voice=installState?.voice||{};
  if(!voice.installed){
    return {code:"INSTALL_VOICE",command:"powershell -ExecutionPolicy Bypass -File .\\scripts\\video-local-install-windows.ps1 -InstallVoice",why:"Chatterbox local non installé"};
  }
  if(voice.cuda_available===false){
    return {code:"FIX_VOICE_CUDA",command:"npm run video:doctor:windows",why:"Chatterbox installé mais CUDA non disponible"};
  }
  const comfy=installState?.comfyui||{};
  if(!comfy.installed){
    return {code:"INSTALL_COMFYUI",command:"powershell -ExecutionPolicy Bypass -File .\\scripts\\video-local-install-windows.ps1 -InstallComfyUI",why:"ComfyUI local non installé"};
  }
  const flux=installState?.flux_schnell_fp8||{};
  if(!flux.installed || flux.hash_verified!==true){
    return {code:"INSTALL_FLUX",command:"powershell -ExecutionPolicy Bypass -File .\\scripts\\video-local-install-windows.ps1 -InstallFluxSchnell",why:"FLUX Schnell FP8 absent ou hash non vérifié"};
  }
  if(!comfyRunning){
    return {code:"START_COMFYUI",command:"npm run video:comfyui:start:windows",why:"ComfyUI est installé mais ne répond pas sur 127.0.0.1:8188"};
  }
  return {
    code:"RUN_ONE_SCENE_SMOKE",
    command:"npm run video:smoke -- video/contracts/obo.v1.json .hibou-video-artifacts/smoke-obo --scene=1 --run-voice --run-image",
    why:"GPU, voix, ComfyUI et FLUX sont prêts"
  };
}

function statePath(){
  const base=process.env.LOCALAPPDATA || join(homedir(),"AppData","Local");
  return join(base,"LeHibou","video","install-state.json");
}
function readState(path){
  if(!existsSync(path)) return {schema:"HIBOU_VIDEO_LOCAL_INSTALL_V1",missing:true};
  try{return JSON.parse(readFileSync(path,"utf8"));}catch{return {schema:"HIBOU_VIDEO_LOCAL_INSTALL_V1",invalid:true};}
}
function loopbackOpen(port=8188,timeoutMs=300){
  return new Promise((resolve)=>{
    const socket=net.createConnection({host:"127.0.0.1",port});
    let done=false;
    const finish=(value)=>{
      if(done)return; done=true;
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(timeoutMs,()=>finish(false));
    socket.once("connect",()=>finish(true));
    socket.once("error",()=>finish(false));
  });
}

export async function collectVideoDoctor(){
  const preflight=collectPreflight();
  const path=statePath();
  const installState=readState(path);
  const comfyRunning=await loopbackOpen(8188);
  const next=decideVideoNextStep({preflight,installState,comfyRunning});
  return {
    schema:"HIBOU_VIDEO_DOCTOR_V1",
    generated_at:new Date().toISOString(),
    preflight,
    install_state_path:path,
    install_state_present:!installState.missing && !installState.invalid,
    install_state:installState,
    comfyui_loopback_8188:comfyRunning,
    next_step:next,
    policy:{
      network_tested:"loopback_only",
      external_network_called:false,
      downloads_performed:false,
      services_started:false,
      paid_fallback:false
    }
  };
}

if(import.meta.url===`file://${process.argv[1]}`){
  const report=await collectVideoDoctor();
  process.stdout.write(JSON.stringify(report,null,2)+"\n");
  if(clean(report.next_step.code)==="FIX_GPU_DETECTION") process.exitCode=2;
}
