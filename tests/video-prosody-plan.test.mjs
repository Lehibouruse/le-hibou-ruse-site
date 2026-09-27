import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { applyProsodyPlan, buildProsodyPlan, splitVerbatim } from "../scripts/video-prosody-plan.mjs";

test("verbatim splitter preserves every source character",()=>{
  const text="Et tu repayes cette marge. Chaque année.";
  const units=splitVerbatim(text);
  assert.equal(units.map(x=>x.source_span).join(""),text);
  assert.deepEqual(units.map(x=>x.tts_text),["Et tu repayes cette marge.","Chaque année."]);
});

test("specific cue becomes pause + slower unit + supported Chatterbox controls without changing words",()=>{
  const scene={
    scene_id:"S01",
    narration_exact:{mode:"text_reference",text:"Et tu repayes cette marge. Chaque année."},
    voice:{verbatim:true,prosody_cues:[{phrase:"Chaque année.",pause_before_ms:350,relative_speed_pct:90,emphasis:"strong",intent:"revelation"}]}
  };
  const p=buildProsodyPlan(scene);
  assert.equal(p.source_text,scene.narration_exact.text);
  assert.equal(p.lexical_transform,false);
  assert.equal(p.units[1].pause_before_ms,350);
  assert.equal(p.units[1].ffmpeg_atempo,.9);
  assert.ok(p.units[1].chatterbox_native.exaggeration>.5);
});

test("contract planner only adds prosody metadata and keeps narration exact",()=>{
  const contract={contract_version:"HIBOU_VIDEO_CONTRACT_V1",scenes:[{
    scene_id:"S01",narration_exact:{mode:"text_reference",text:"Mot pour mot."},voice:{verbatim:true}
  }]};
  const out=applyProsodyPlan(contract);
  assert.equal(out.scenes[0].narration_exact.text,"Mot pour mot.");
  assert.equal(out.features.video_prosody_v1,true);
});

test("Chatterbox batch supports prosody units but remains syntactically valid",()=>{
  const r=spawnSync("python3",["-m","py_compile","scripts/chatterbox-storyboard-batch.py"],{encoding:"utf8"});
  assert.equal(r.status,0,r.stderr||r.stdout);
  const source=readFileSync(new URL("../scripts/chatterbox-storyboard-batch.py",import.meta.url),"utf8");
  assert.match(source,/HIBOU_CHATTERBOX_BATCH_V3_PROSODY/);
  assert.match(source,/HIBOU_PROSODY_PLAN_V1/);
  assert.match(source,/atempo=/);
  assert.match(source,/verbatim_preserved/);
});
