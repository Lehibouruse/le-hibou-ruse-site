import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("hardware runbook requires runtime detection",()=>{
  const doc=readFileSync(new URL("../docs/video-first-run-windows.md",import.meta.url),"utf8");
  assert.match(doc,/détecté au runtime/i);
  assert.match(doc,/detect-at-runtime\.json/);
  assert.doesNotMatch(doc,/Matériel de référence vérifié/);
});

test("historical exact ROG profile is explicitly unverified",()=>{
  const p=JSON.parse(readFileSync(new URL("../video/hardware/rog-g814ji-rtx4070-8gb.json",import.meta.url),"utf8"));
  assert.equal(p.verified,false);
  assert.equal(p.do_not_use_without_runtime_match,true);
  assert.equal(p.status,"UNVERIFIED_EXAMPLE_ONLY");
});
