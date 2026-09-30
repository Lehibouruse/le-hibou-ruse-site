import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const launcher=readFileSync(new URL("../scripts/start-hibou-video-v5-local.ps1",import.meta.url),"utf8");

test("explicit V5 launcher enables every double-gated runtime capability",()=>{
  for(const name of [
    "HIBOU_VIDEO_TIMELINE_V1",
    "HIBOU_VIDEO_PLANNING_AUDIT_V1",
    "HIBOU_VIDEO_INCREMENTAL_RETOUCH_V1",
    "HIBOU_VIDEO_PROSODY_V1",
    "HIBOU_VIDEO_MUSIC_V1",
    "HIBOU_VIDEO_POSE_REGISTRY_V1",
    "HIBOU_VIDEO_HUMAN_SELECTION_V1",
    "HIBOU_VIDEO_CREATIVE_QC_V1",
    "HIBOU_VIDEO_FACTUAL_GATE_V1"
  ]){
    assert.match(launcher,new RegExp("\\$env:"+name+"\\s*=\\s*\\\"true\\\""));
  }
  assert.match(launcher,/airtable_contract_still_required = \$true/);
  assert.match(launcher,/publication_authorized = \$false/);
});

test("V5 launcher does not persist feature gates globally outside its activated worker process",()=>{
  assert.doesNotMatch(launcher,/SetEnvironmentVariable\("HIBOU_VIDEO_TIMELINE_V1"/);
  assert.doesNotMatch(launcher,/SetEnvironmentVariable\("HIBOU_VIDEO_CREATIVE_QC_V1"/);
});
