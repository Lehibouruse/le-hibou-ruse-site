import assert from "node:assert/strict";
import test from "node:test";
import { decideVideoNextStep } from "../scripts/video-doctor.mjs";

const readyPreflight={
  nvidia_smi_available:true,
  gpus:[{name:"RTX"}],
  decision:{blocking_reasons:[]}
};
const baseState={
  voice:{installed:true,cuda_available:true},
  comfyui:{installed:true},
  flux_schnell_fp8:{installed:true,hash_verified:true}
};

test("doctor blocks before GPU detection",()=>{
  const r=decideVideoNextStep({preflight:{nvidia_smi_available:false,gpus:[],decision:{blocking_reasons:["no_nvidia_gpu"]}}});
  assert.equal(r.code,"FIX_GPU_DETECTION");
});

test("doctor walks installation stages deterministically",()=>{
  assert.equal(decideVideoNextStep({preflight:readyPreflight,installState:{},comfyRunning:false}).code,"INSTALL_VOICE");
  assert.equal(decideVideoNextStep({preflight:readyPreflight,installState:{voice:{installed:true,cuda_available:true}},comfyRunning:false}).code,"INSTALL_COMFYUI");
  assert.equal(decideVideoNextStep({preflight:readyPreflight,installState:{...baseState,flux_schnell_fp8:{installed:false}},comfyRunning:false}).code,"INSTALL_FLUX");
  assert.equal(decideVideoNextStep({preflight:readyPreflight,installState:baseState,comfyRunning:false}).code,"START_COMFYUI");
  assert.equal(decideVideoNextStep({preflight:readyPreflight,installState:baseState,comfyRunning:true}).code,"RUN_ONE_SCENE_SMOKE");
});

test("doctor never proposes cloud or paid fallback",()=>{
  const steps=[
    decideVideoNextStep({preflight:readyPreflight,installState:{},comfyRunning:false}),
    decideVideoNextStep({preflight:readyPreflight,installState:baseState,comfyRunning:true})
  ];
  assert.equal(JSON.stringify(steps).toLowerCase().includes("cloud"),false);
  assert.equal(JSON.stringify(steps).toLowerCase().includes("paid"),false);
});
