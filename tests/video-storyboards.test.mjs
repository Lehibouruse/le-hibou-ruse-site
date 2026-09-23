import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { validateVideoContract } from "../scripts/video-local-render.mjs";

function check(path) {
  const contract=JSON.parse(readFileSync(new URL(path, import.meta.url),"utf8"));
  assert.equal(contract.contract_version,"HIBOU_VIDEO_CONTRACT_V1");
  assert.equal(contract.contract_state,"storyboard");
  assert.equal(contract.scenes.length,15);
  assert.deepEqual(contract.scenes.map(s=>s.order),Array.from({length:15},(_,i)=>i+1));
  const script=contract.scenes.map(s=>s.narration_exact.text).join(" ");
  const hash=createHash("sha256").update(script).digest("hex");
  assert.equal(hash,contract.qc.script_sha256);
  for(const scene of contract.scenes){
    assert.equal(scene.narration_exact.mode,"text_reference");
    assert.equal(scene.narration_exact.script_sha256,hash);
    assert.equal(scene.image.selected,null);
    assert.equal(scene.image.candidates.length,0);
  }
  assert.throws(()=>validateVideoContract(contract,process.cwd()),/storyboard contract is not render-ready/);
}

test("OBO storyboard is exact and deliberately non-renderable",()=>check("../examples/obo-storyboard-v1.json"));
test("Donation-cession storyboard is exact and deliberately non-renderable",()=>check("../examples/donation-cession-storyboard-v1.json"));
