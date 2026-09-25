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

test("runtime hardware profile preserves safety without inventing a device",()=>{
  const path="video/hardware/detect-at-runtime.json";
  assert.equal(existsSync(path),true);
  assert.equal(existsSync("video/hardware/rog-g814ji-rtx4070-8gb.json"),false);
  const p=JSON.parse(readFileSync(path,"utf8"));
  assert.equal(p.status,"DETECT_AT_RUNTIME");
  assert.equal(p.source_of_truth,"runtime_diagnostic");
  assert.equal(p.policy.no_heavy_model_download_before_diagnostic,true);
  assert.equal(p.policy.no_paid_cloud_fallback,true);
  assert.ok(p.unknown_until_diagnostic.includes("gpu_model"));
  assert.ok(p.unknown_until_diagnostic.includes("vram_gb"));
});
