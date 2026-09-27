import assert from "node:assert/strict";
import test from "node:test";
import { inspectSpecificScene, validateGlobalSpecificSeparation } from "../scripts/video-layer-guard.mjs";

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
