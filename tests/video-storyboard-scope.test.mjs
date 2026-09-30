import assert from "node:assert/strict";
import test from "node:test";
import { scopeStoryboardForJob } from "../scripts/video-storyboard-scope.mjs";

function storyboard(){
  return {
    contract_version:"HIBOU_VIDEO_CONTRACT_V1",
    content:{content_id:"recX"},
    scenes:[
      {scene_id:"S01",planned_duration_s:4},
      {scene_id:"S02",planned_duration_s:5},
      {scene_id:"S03",planned_duration_s:6}
    ],
    qc:{status:"TIMING_PASS_MEDIA_NOT_RUN",technical:{planned_duration_s:15,scene_count:3}},
    validation:{publication_authorized:false}
  };
}

test("preview scope physically reduces storyboard before master policy sees it",()=>{
  const original=storyboard();
  const scoped=scopeStoryboardForJob(original,{maxScenes:2,mode:"preview"});
  assert.equal(original.scenes.length,3);
  assert.equal(scoped.scenes.length,2);
  assert.deepEqual(scoped.scenes.map(x=>x.scene_id),["S01","S02"]);
  assert.equal(scoped.qc.technical.scene_count,2);
  assert.equal(scoped.qc.technical.planned_duration_s,9);
  assert.equal(scoped.render_scope.partial,true);
  assert.equal(scoped.render_scope.original_scene_count,3);
  assert.equal(scoped.render_scope.render_scene_count,2);
  assert.equal(scoped.render_scope.publication_authorized,false);
});

test("scope keeps a full storyboard unchanged in scene count",()=>{
  const scoped=scopeStoryboardForJob(storyboard(),{maxScenes:20,mode:"final"});
  assert.equal(scoped.scenes.length,3);
  assert.equal(scoped.render_scope.partial,false);
  assert.equal(scoped.qc.technical.planned_duration_s,15);
});

test("scope rejects invalid production modes",()=>{
  assert.throws(()=>scopeStoryboardForJob(storyboard(),{maxScenes:2,mode:"turbo"}),/preview or final/);
});
