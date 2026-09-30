import assert from "node:assert/strict";
import test from "node:test";
import { buildIterationPlan } from "../scripts/video-iteration-plan.mjs";

function base(){
  return {
    contract_version:"HIBOU_VIDEO_CONTRACT_V1",
    content:{content_id:"recVideo"},
    engine:{renderer:"ffmpeg",renderer_version:"1",width:1080,height:1920,fps:30},
    creative:{style_lock:"style-a",branding:{text:"Le Hibou Rusé"}},
    music:{reference:"music.wav",level_db:-24},
    features:{video_timeline_v1:true},
    production:{mode:"preview",candidates_per_scene:1},
    scenes:[
      {
        scene_id:"S01",order:1,planned_duration_s:4,
        narration_exact:{mode:"text_reference",text:"Bonjour.",script_sha256:"a".repeat(64)},
        breath_unit:"Bonjour.",voice:{relative_speed_pct:100,pause_after_ms:120},
        visual_idea:"bureau",image_prompt:"bureau français",framing:{hibou:true},
        screen_text:"BONJOUR",timeline:{schema:"HIBOU_SCENE_TIMELINE_V1",events:[]}
      },
      {
        scene_id:"S02",order:2,planned_duration_s:4,
        narration_exact:{mode:"text_reference",text:"Suite.",script_sha256:"a".repeat(64)},
        breath_unit:"Suite.",voice:{relative_speed_pct:95,pause_after_ms:250},
        visual_idea:"graphique",image_prompt:"graphique simple",framing:{hibou:false},
        screen_text:"SUITE",timeline:{schema:"HIBOU_SCENE_TIMELINE_V1",events:[]}
      }
    ]
  };
}

test("caption-only retouch keeps voice and images reusable",()=>{
  const before=base(), after=structuredClone(before);
  after.scenes[0].screen_text="NOUVEAU TEXTE";
  const plan=buildIterationPlan(before,after);
  assert.deepEqual(plan.changed_scene_ids,["S01"]);
  assert.equal(plan.invalidated_stages.includes("subtitles"),true);
  assert.equal(plan.invalidated_scene_ids.voice.includes("S01"),false);
  assert.equal(plan.invalidated_scene_ids.images.includes("S01"),false);
  assert.equal(plan.reusable_scene_ids.voice.includes("S01"),true);
  assert.equal(plan.reusable_scene_ids.images.includes("S01"),true);
});

test("image brief retouch invalidates only the affected image/render path",()=>{
  const before=base(), after=structuredClone(before);
  after.scenes[1].image_prompt="graphique premium avec pièce";
  const plan=buildIterationPlan(before,after);
  assert.deepEqual(plan.invalidated_scene_ids.images,["S02"]);
  assert.deepEqual(plan.invalidated_scene_ids.render,["S02"]);
  assert.equal(plan.invalidated_scene_ids.voice.includes("S02"),false);
  assert.equal(plan.invalidated_stages.includes("creative_qc"),true);
});

test("narration retouch invalidates voice but not image generation",()=>{
  const before=base(), after=structuredClone(before);
  after.scenes[0].narration_exact.text="Bonjour à tous.";
  after.scenes[0].breath_unit="Bonjour à tous.";
  const plan=buildIterationPlan(before,after);
  assert.deepEqual(plan.invalidated_scene_ids.voice,["S01"]);
  assert.equal(plan.invalidated_scene_ids.images.includes("S01"),false);
  assert.equal(plan.invalidated_stages.includes("audio_master"),true);
  assert.equal(plan.invalidated_stages.includes("subtitles"),true);
});

test("GLOBAL style change invalidates visual generation for every scene",()=>{
  const before=base(), after=structuredClone(before);
  after.creative.style_lock="style-b";
  const plan=buildIterationPlan(before,after);
  assert.deepEqual(plan.invalidated_scene_ids.images,["S01","S02"]);
  assert.deepEqual(plan.global_changes,["style"]);
});

test("scene structure change is conservative and publication remains locked",()=>{
  const before=base(), after=structuredClone(before);
  after.scenes.push({...structuredClone(after.scenes[1]),scene_id:"S03",order:3});
  const plan=buildIterationPlan(before,after);
  assert.equal(plan.structural_change,true);
  assert.equal(plan.invalidated_stages.includes("voice"),true);
  assert.equal(plan.invalidated_stages.includes("images"),true);
  assert.equal(plan.policy.publication_authorized,false);
  assert.equal(plan.policy.human_review_required,true);
});


test("production profile changes rerun cache-validation stages without semantic image invalidation",()=>{
  const before=base(), after=structuredClone(before);
  before.production={mode:"final",candidates_per_scene:3};
  after.production={mode:"preview",candidates_per_scene:1};
  const plan=buildIterationPlan(before,after);
  assert.equal(plan.global_changes.includes("production"),true);
  assert.equal(plan.invalidated_stages.includes("images"),true);
  assert.deepEqual(plan.invalidated_scene_ids.images,[]);
  assert.deepEqual(plan.reusable_scene_ids.images,["S01","S02"]);
  assert.equal(plan.policy.production_profile_changes_use_engine_fingerprints,true);
});


test("incremental retouch requires content_id on both contracts",()=>{
  const before=base(), after=structuredClone(before);
  delete before.content.content_id;
  assert.throws(
    ()=>buildIterationPlan(before,after),
    /requires content_id on both contracts/
  );
});

test("incremental retouch rejects a different content_id",()=>{
  const before=base(), after=structuredClone(before);
  after.content.content_id="recDifferent";
  assert.throws(
    ()=>buildIterationPlan(before,after),
    /requires the same content_id/
  );
});
