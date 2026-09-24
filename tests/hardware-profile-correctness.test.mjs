import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("hardware identity is user-confirmed but runtime preflight remains mandatory",()=>{
  const doc=readFileSync(new URL("../docs/video-first-run-windows.md",import.meta.url),"utf8");
  assert.match(doc,/confirmé par l’utilisateur/i);
  assert.match(doc,/rog-g814ji-rtx4070-8gb\.json/);
  assert.match(doc,/diagnostic runtime reste obligatoire/i);
});

test("confirmed ROG profile preserves runtime safeguards",()=>{
  const p=JSON.parse(readFileSync(new URL("../video/hardware/rog-g814ji-rtx4070-8gb.json",import.meta.url),"utf8"));
  assert.equal(p.verified,true);
  assert.equal(p.do_not_use_without_runtime_match,false);
  assert.match(p.status,/USER_CONFIRMED/);
  assert.match(p.verification_command,/gpu-check:windows/);
  assert.equal(p.safeguards.public_comfyui_endpoint,false);
  assert.equal(p.safeguards.paid_api_fallback,false);
});
