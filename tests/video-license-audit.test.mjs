import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { auditRepositoryLicensePins, classifyFfmpegVersion, classifyModelName } from "../scripts/video-license-audit.mjs";

const policy=JSON.parse(readFileSync(new URL("../config/video-license-policy.json",import.meta.url),"utf8"));
const installer=readFileSync(new URL("../scripts/video-local-install-windows.ps1",import.meta.url),"utf8");

test("approved FLUX schnell FP8 is allowed and dev family is blocked",()=>{
  assert.equal(classifyModelName("flux1-schnell-fp8.safetensors",policy).status,"PASS");
  const dev=classifyModelName("FLUX.1-dev.safetensors",policy);
  assert.equal(dev.status,"BLOCK");
  assert.equal(dev.reason,"noncommercial_model_family");
});

test("unknown model license fails closed",()=>{
  const r=classifyModelName("mystery-model.safetensors",policy);
  assert.equal(r.status,"BLOCK");
  assert.equal(r.reason,"unknown_model_license");
});

test("repository installer pins reviewed model hash and Chatterbox version",()=>{
  const r=auditRepositoryLicensePins(policy,installer);
  assert.equal(r.ok,true);
  assert.equal(r.checks.every(x=>x.ok),true);
});

test("ffmpeg build classification distinguishes LGPL GPL and nonfree",()=>{
  const lgpl=classifyFfmpegVersion("ffmpeg version x\nconfiguration: --enable-shared");
  assert.equal(lgpl.build_license,"LGPL-2.1-or-later_or_build_specific");
  assert.equal(lgpl.local_render_allowed,true);
  const gpl=classifyFfmpegVersion("configuration: --enable-gpl --enable-libx264");
  assert.equal(gpl.build_license,"GPL-2.0-or-later");
  assert.equal(gpl.redistribution_status,"GPL_OBLIGATIONS");
  const nonfree=classifyFfmpegVersion("configuration: --enable-gpl --enable-nonfree");
  assert.equal(nonfree.redistribution_status,"BLOCK");
});

test("voice and unknown custom-node rights are fail-closed in policy",()=>{
  assert.equal(policy.gates.voice_reference_rights_unknown,"block");
  assert.equal(policy.gates.custom_comfyui_node_license_unknown,"block");
  assert.equal(policy.gates.license_revalidation_before_public_release,true);
});

test("toolchain policy pins ComfyUI and top-level forensic dependencies",()=>{
  const comfy=policy.components.find(x=>x.id==="comfyui");
  const faster=policy.components.find(x=>x.id==="faster-whisper");
  const opencv=policy.components.find(x=>x.id==="opencv-python-headless-4.14.0.94");
  assert.equal(comfy.version,"0.37.0");
  assert.equal(comfy.source_ref,"v0.37.0");
  assert.equal(faster.version,"1.2.1");
  assert.equal(opencv.version,"4.14.0.94");
  assert.equal(policy.gates.unpinned_top_level_forensic_dependency,"block");
});

test("Windows installer no longer follows an unversioned ComfyUI latest release",()=>{
  assert.match(installer,/\$ComfyVersion = "0\.37\.0"/);
  assert.match(installer,/releases\/download\/v\$ComfyVersion/);
  assert.doesNotMatch(installer,/releases\/latest\/download/);
  assert.match(installer,/Version ComfyUI inattendue/);
});
