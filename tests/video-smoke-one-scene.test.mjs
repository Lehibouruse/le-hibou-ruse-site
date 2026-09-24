import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { buildOneSceneContract, prepareSmoke } from "../scripts/video-smoke-one-scene.mjs";

function sample(){
  return {
    contract_version:"HIBOU_VIDEO_CONTRACT_V1",
    contract_state:"storyboard",
    content:{content_id:"demo"},
    scenes:[
      {scene_id:"S01",order:1,narration_exact:{mode:"text_reference",text:"Un"}},
      {scene_id:"S02",order:2,narration_exact:{mode:"text_reference",text:"Deux"}}
    ],
    validation:{publication_authorized:false}
  };
}
test("one-scene smoke preserves selected scene but renumbers it locally",()=>{
  const out=buildOneSceneContract(sample(),2);
  assert.equal(out.scenes.length,1);
  assert.equal(out.scenes[0].scene_id,"S02");
  assert.equal(out.scenes[0].order,1);
  assert.equal(out.smoke_test.source_scene_order,2);
  assert.equal(out.validation.publication_authorized,false);
});
test("prepareSmoke writes a deliberately non-publishable one-scene contract",()=>{
  const root=mkdtempSync(resolve(tmpdir(),"hibou-smoke-"));
  const input=resolve(root,"storyboard.json");
  writeFileSync(input,JSON.stringify(sample()));
  const state=prepareSmoke(input,resolve(root,"out"),1);
  const parsed=JSON.parse(readFileSync(state.storyboard,"utf8"));
  assert.equal(parsed.scenes[0].scene_id,"S01");
  assert.equal(parsed.smoke_test.publication_authorized,false);
});
