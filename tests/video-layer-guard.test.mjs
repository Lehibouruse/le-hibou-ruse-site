import assert from "node:assert/strict";
import test from "node:test";
import { inspectSpecificScene, validateGlobalSpecificSeparation, validatePromptPropagation } from "../scripts/video-layer-guard.mjs";

test("specific scenes can control local narration/timeline/pose but not GLOBAL policy",()=>{
  const good={
    contract_version:"HIBOU_VIDEO_CONTRACT_V1",
    scenes:[{
      scene_id:"S01",
      order:1,
      narration_exact:{mode:"text_reference",text:"Exact."},
      visual_idea:"graphique",
      timeline:{schema:"HIBOU_SCENE_TIMELINE_V1",events:[]},
      pose_request:"pointe",
      music_cue:"accent only"
    }]
  };
  assert.equal(validateGlobalSpecificSeparation(good).pass,true);

  const bad={
    ...good,
    scenes:[{
      ...good.scenes[0],
      music:{reference:"override.mp3"},
      style_lock:"ignore global",
      engine:{renderer:"other"}
    }]
  };
  assert.throws(
    ()=>validateGlobalSpecificSeparation(bad),
    /specific scene attempted GLOBAL override/
  );
});

test("unknown legacy scene keys are reported but remain backward-compatible by default",()=>{
  const result=inspectSpecificScene({scene_id:"S02",legacy_extra:"keep-compatible"});
  assert.equal(result.pass,true);
  assert.deepEqual(result.unknown_scene_keys,["legacy_extra"]);
});


function propagatedContract(){
  return {
    contract_version:"HIBOU_VIDEO_CONTRACT_V1",
    content:{
      source:"airtable",
      method_version:"VIDEO_METHOD_V4.3",
      profile_version:"2.5-V4.3"
    },
    creative:{
      style_lock:"premium editorial",
      negative_prompt:"no humans",
      character_lock:"canonical owl",
      content_brief:"13-scene specific brief",
      reference_mode:"deterministic_character_overlay",
      reference_image_local:"C:/tmp/hibou.webp",
      text_in_generated_images:false,
      branding:{text:"Le Hibou Rusé",color:"sand"}
    },
    audio:{
      voice_profile_id:"VOICE_V4_ORIGINAL",
      voice_profile_text:"warm natural French male voice"
    },
    scenes:[{
      scene_id:"S01",
      order:1,
      narration_exact:{mode:"text_reference",text:"Pourquoi le prêt Lombard est une arnaque ?"},
      visual_idea:"Hibou devant une banque",
      image_prompt:"Banque privée chic, sans texte généré",
      screen_text:"LE LOMBARD : UNE ARNAQUE ?",
      planned_duration_s:4,
      framing:{hibou:true},
      voice:{relative_speed_pct:103,pause_after_ms:100,intent:"attaque forte, ironique"}
    }]
  };
}

test("prompt propagation audit proves GLOBAL and SPECIFIC baseline routing",()=>{
  const result=validatePromptPropagation(propagatedContract());
  assert.equal(result.pass,true);
  assert.equal(result.global.canonical_character_overlay,true);
  assert.equal(result.global.voice_profile_id,"VOICE_V4_ORIGINAL");
  assert.equal(result.coverage.hibou_scenes,1);
  assert.match(result.routing.image,/current scene visual only/);
  assert.match(result.invariant,/optional V5 refinements cannot disable/);
});

test("prompt propagation audit refuses an Airtable storyboard missing the GLOBAL voice or style",()=>{
  const bad=propagatedContract();
  bad.audio.voice_profile_text="";
  bad.creative.style_lock="";
  assert.throws(
    ()=>validatePromptPropagation(bad),
    /GLOBAL prompt propagation incomplete/
  );
});

test("prompt propagation audit refuses a scene whose local voice intent was lost",()=>{
  const bad=propagatedContract();
  bad.scenes[0].voice.intent="";
  assert.throws(
    ()=>validatePromptPropagation(bad),
    /SPECIFIC prompt propagation incomplete/
  );
});

test("prompt propagation audit refuses a Hibou scene if the canonical asset was not resolved",()=>{
  const bad=propagatedContract();
  bad.creative.reference_image_local="";
  assert.throws(
    ()=>validatePromptPropagation(bad),
    /reference_image_local/
  );
});
