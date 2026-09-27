import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, readFileSync } from "node:fs";

test("hardware identity stays unverified until runtime diagnostic",()=>{
  const doc=readFileSync(new URL("../docs/video-first-run-windows.md",import.meta.url),"utf8");
  assert.match(doc,/matériel exact doit être détecté localement/i);
  assert.match(doc,/detect-at-runtime\.json/);
  assert.match(doc,/diagnostic runtime/i);
  assert.doesNotMatch(doc,/confirmé par l’utilisateur/i);
  assert.doesNotMatch(doc,/G814JI|RTX 4070 Laptop|13980HX/i);
});

test("runtime hardware profile preserves safety while allowing explicitly verified device profiles",()=>{
  const path="video/hardware/detect-at-runtime.json";
  assert.equal(existsSync(path),true);
  const generic=JSON.parse(readFileSync(path,"utf8"));
  assert.equal(generic.status,"DETECT_AT_RUNTIME");
  assert.equal(generic.source_of_truth,"runtime_diagnostic");
  assert.equal(generic.policy.no_heavy_model_download_before_diagnostic,true);
  assert.equal(generic.policy.no_paid_cloud_fallback,true);
  assert.ok(generic.unknown_until_diagnostic.includes("gpu_model"));
  assert.ok(generic.unknown_until_diagnostic.includes("vram_gb"));

  const verifiedPath="video/hardware/rog-g814ji-rtx4070-8gb.json";
  assert.equal(existsSync(verifiedPath),true);
  const verified=JSON.parse(readFileSync(verifiedPath,"utf8"));
  assert.equal(verified.status,"VALIDATED_LOCAL_BASELINE");
  assert.equal(verified.source_of_truth,"local_preflight_verified");
  assert.equal(verified.policy.paid_cloud_fallback,false);
  assert.equal(verified.policy.publication_authorized,false);
});
