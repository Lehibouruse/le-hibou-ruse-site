import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";

test("confirmed local hardware profile exists and remains runtime-preflight gated",()=>{
  const path="video/hardware/rog-g814ji-rtx4070-8gb.json";
  assert.equal(existsSync(path),true);
  const profile=JSON.parse(readFileSync(path,"utf8"));
  assert.equal(profile.profile_id,"ROG_G814JI_RTX4070_8GB");
  assert.equal(profile.device.gpu,"NVIDIA GeForce RTX 4070 Laptop GPU");
  assert.equal(profile.device.vram_gb,8);
  assert.equal(profile.device.ram_gb,32);
  assert.equal(profile.verified,true);
  assert.match(profile.status,/USER_CONFIRMED/);
  assert.match(profile.verification_command,/gpu-check:windows/);
  assert.equal(profile.safeguards.paid_api_fallback,false);
  assert.equal(profile.safeguards.public_comfyui_endpoint,false);
});

test("Windows runbook points to the real confirmed profile and still requires runtime diagnostic",()=>{
  const doc=readFileSync("docs/video-first-run-windows.md","utf8");
  assert.match(doc,/rog-g814ji-rtx4070-8gb\.json/);
  assert.doesNotMatch(doc,/detect-at-runtime\.json/);
  assert.match(doc,/diagnostic runtime reste obligatoire/i);
});
