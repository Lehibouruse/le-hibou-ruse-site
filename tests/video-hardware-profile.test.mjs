import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";

test("canonical local hardware profile requires runtime detection",()=>{
  const path="video/hardware/detect-at-runtime.json";
  assert.equal(existsSync(path),true);
  const profile=JSON.parse(readFileSync(path,"utf8"));
  assert.equal(profile.status,"DETECT_AT_RUNTIME");
  assert.equal(profile.known.platform,"Windows");
  assert.equal(profile.known.cpu_family,"Intel Core i9");
  assert.equal(profile.known.gpu_vendor,"NVIDIA");
  assert.equal(profile.known.gpu_family,"GeForce RTX");
  assert.ok(profile.required_commands.includes("npm run video:gpu-check:windows"));
  assert.equal(profile.policy.no_paid_cloud_fallback,true);
});

test("Windows runbook points to runtime profile and does not claim exact hardware",()=>{
  const doc=readFileSync("docs/video-first-run-windows.md","utf8");
  assert.match(doc,/detect-at-runtime\.json/);
  assert.match(doc,/diagnostic runtime/i);
  assert.doesNotMatch(doc,/rog-g814ji-rtx4070-8gb\.json/);
  assert.doesNotMatch(doc,/G814JI|RTX 4070 Laptop|13980HX/i);
});
