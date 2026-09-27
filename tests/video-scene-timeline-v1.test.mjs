import assert from "node:assert/strict";
import test from "node:test";
import { buildSceneCompositePlan, normalizeSceneTimeline, sceneAssetRefs } from "../scripts/video-scene-compositor.mjs";

test("timeline is optional and legacy scenes remain unchanged",()=>{
  const scene={scene_id:"S01",image:{selected:"bg.png"},planned_duration_s:9};
  assert.deepEqual(normalizeSceneTimeline(scene,{duration:9}).events,[]);
  assert.deepEqual(sceneAssetRefs(scene),["bg.png"]);
});

test("timeline supports independent timed text without replacing the background",()=>{
  const scene={
    scene_id:"S02",
    image:{selected:"bg.png"},
    planned_duration_s:9,
    timeline:{schema:"HIBOU_SCENE_TIMELINE_V1",events:[
      {id:"rate",type:"text",start_s:0,end_s:3,text:"TAUX DE MARCHÉ"},
      {id:"one",type:"callout",start_s:3,end_s:5,text:"+1 %"},
      {id:"onehalf",type:"callout",start_s:5,end_s:7,text:"+1,5 %"},
      {id:"year",type:"text",start_s:7,end_s:9,text:"CHAQUE ANNÉE"}
    ]}
  };
  const plan=buildSceneCompositePlan(scene,{duration:9});
  assert.deepEqual(plan.input_refs,["bg.png"]);
  assert.match(plan.filter_complex,/between\(t,0\.000,3\.000\)/);
  assert.match(plan.filter_complex,/TAUX DE MARCHÉ/);
  assert.match(plan.filter_complex,/CHAQUE ANNÉE/);
  assert.equal(plan.timeline.events.length,4);
});

test("timeline pose/object assets are independent inputs and camera event changes zoompan",()=>{
  const scene={
    scene_id:"S03",
    image:{selected:"bg.png"},
    planned_duration_s:6,
    timeline:{schema:"HIBOU_SCENE_TIMELINE_V1",events:[
      {id:"pose",type:"pose",start_s:1,end_s:4,path:"poses/pointe.webp",anchor:"bottom-right"},
      {id:"chart",type:"object",start_s:2,end_s:5,path:"objects/chart.webp"},
      {id:"camera",type:"camera",start_s:3,end_s:6,zoom_percent:5,anchor:"right"}
    ]}
  };
  const plan=buildSceneCompositePlan(scene,{duration:6,fps:30});
  assert.deepEqual(plan.input_refs,["bg.png","poses/pointe.webp","objects/chart.webp"]);
  assert.match(plan.filter_complex,/overlay=.*enable='between\(t,1\.000,4\.000\)'/);
  assert.match(plan.filter_complex,/between\(on,91,180\)/);
  assert.match(plan.filter_complex,/1\.05000/);
});
