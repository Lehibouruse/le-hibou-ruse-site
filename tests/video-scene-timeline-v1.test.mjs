import assert from "node:assert/strict";
import test from "node:test";
import { analyzeBeatVariation, buildSceneCompositePlan, normalizeSceneTimeline, sceneAssetRefs } from "../scripts/video-scene-compositor.mjs";

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
  assert.match(plan.filter_complex,/1\+0\.05000\*\(max\(0,min\(1,\(on-91\)\/89\)\)\)/);
});

test("timed object can move slightly without replacing the scene image",()=>{
  const scene={
    scene_id:"S04",image:{selected:"bg.png"},planned_duration_s:5,
    timeline:{schema:"HIBOU_SCENE_TIMELINE_V1",events:[
      {type:"object",start_s:1,end_s:4,path:"arrow.png",offset_x:0,offset_y:0,move_to_offset_x:36,move_to_offset_y:-20}
    ]}
  };
  const plan=buildSceneCompositePlan(scene,{duration:5});
  assert.deepEqual(plan.input_refs,["bg.png","arrow.png"]);
  assert.match(plan.filter_complex,/\(t-1\.000\)\/3\.000/);
  assert.match(plan.filter_complex,/\*36\.000/);
  assert.match(plan.filter_complex,/\*-20\.000/);
});

test("visual accent compiles to a timed post-production overlay",()=>{
  const scene={
    scene_id:"S05",image:{selected:"bg.png"},planned_duration_s:4,
    timeline:{schema:"HIBOU_SCENE_TIMELINE_V1",events:[
      {type:"accent",start_s:1.5,end_s:2.5,accent:"gold_border"}
    ]}
  };
  const plan=buildSceneCompositePlan(scene,{duration:4});
  assert.match(plan.filter_complex,/drawbox=/);
  assert.match(plan.filter_complex,/0xC7A65A@0\.75/);
  assert.match(plan.filter_complex,/between\(t,1\.500,2\.500\)/);
});


test("beat variation policy flags three consecutive beats from the same family without blocking render",()=>{
  const timeline=normalizeSceneTimeline({
    planned_duration_s:6,
    timeline:{schema:"HIBOU_SCENE_TIMELINE_V1",events:[
      {id:"a",type:"text",start_s:0,end_s:2,text:"A"},
      {id:"b",type:"callout",start_s:2,end_s:4,text:"B"},
      {id:"c",type:"text",start_s:4,end_s:6,text:"C"}
    ]}
  },{duration:6});
  const report=analyzeBeatVariation(timeline);
  assert.equal(report.review_required,true);
  assert.equal(report.blocking,false);
  assert.equal(report.warnings[0].family,"caption");
  assert.deepEqual(report.warnings[0].event_ids,["a","b","c"]);
});

test("beat variation policy accepts a mixed attention-beat sequence",()=>{
  const timeline=normalizeSceneTimeline({
    planned_duration_s:8,
    timeline:{schema:"HIBOU_SCENE_TIMELINE_V1",events:[
      {id:"a",type:"text",start_s:0,end_s:2,text:"A"},
      {id:"b",type:"object",start_s:2,end_s:4,path:"coin.png"},
      {id:"c",type:"pose",start_s:4,end_s:6,path:"pose.png"},
      {id:"d",type:"callout",start_s:6,end_s:8,text:"+1 %"}
    ]}
  },{duration:8});
  const report=analyzeBeatVariation(timeline);
  assert.equal(report.review_required,false);
  assert.deepEqual(report.warnings,[]);
});

test("compositor exposes the advisory beat variation report with the render plan",()=>{
  const scene={
    scene_id:"S06",image:{selected:"bg.png"},planned_duration_s:6,
    timeline:{schema:"HIBOU_SCENE_TIMELINE_V1",events:[
      {type:"text",start_s:0,end_s:2,text:"A"},
      {type:"text",start_s:2,end_s:4,text:"B"},
      {type:"text",start_s:4,end_s:6,text:"C"}
    ]}
  };
  const plan=buildSceneCompositePlan(scene,{duration:6});
  assert.equal(plan.beat_variation.schema,"HIBOU_BEAT_VARIATION_POLICY_V1");
  assert.equal(plan.beat_variation.review_required,true);
});


test("semantic beat kinds are explicit while technical render types stay unchanged",()=>{
  const timeline=normalizeSceneTimeline({
    planned_duration_s:6,
    timeline:{schema:"HIBOU_SCENE_TIMELINE_V1",events:[
      {id:"risk",type:"text",beat_kind:"RISK_BADGE",start_s:0,end_s:2,text:"RISQUE"},
      {id:"diagram",type:"object",beat_kind:"MINI_DIAGRAM",start_s:2,end_s:4,path:"diagram.png"},
      {id:"move",type:"object",start_s:4,end_s:6,path:"coin.png",offset_x:0,move_to_offset_x:30}
    ]}
  },{duration:6});
  assert.equal(timeline.events[0].type,"text");
  assert.equal(timeline.events[0].beat_kind,"RISK_BADGE");
  assert.equal(timeline.events[1].beat_kind,"MINI_DIAGRAM");
  assert.equal(timeline.events[2].beat_kind,"LAYER_MOTION");
});

test("unsupported semantic beat kinds fail closed",()=>{
  assert.throws(()=>normalizeSceneTimeline({
    planned_duration_s:2,
    timeline:{schema:"HIBOU_SCENE_TIMELINE_V1",events:[
      {type:"text",beat_kind:"RANDOM_FLASH",start_s:0,end_s:2,text:"X"}
    ]}
  },{duration:2}),/unsupported beat_kind RANDOM_FLASH/);
});

test("beat variation remains advisory and proposes alternatives without rewriting",()=>{
  const timeline=normalizeSceneTimeline({
    planned_duration_s:6,
    timeline:{schema:"HIBOU_SCENE_TIMELINE_V1",events:[
      {id:"a",type:"text",beat_kind:"CONDITION_BADGE",start_s:0,end_s:2,text:"SI"},
      {id:"b",type:"text",beat_kind:"RISK_BADGE",start_s:2,end_s:4,text:"RISQUE"},
      {id:"c",type:"callout",beat_kind:"NUMBER_CALLOUT",start_s:4,end_s:6,text:"+20 %"}
    ]}
  },{duration:6});
  const report=analyzeBeatVariation(timeline);
  assert.equal(report.review_required,true);
  assert.equal(report.automatic_rewrite_performed,false);
  assert(report.warnings[0].suggested_alternative_families.includes("prop"));
  assert(report.semantic_kind_catalog.includes("BEFORE_AFTER"));
});
