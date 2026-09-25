import assert from "node:assert/strict";
import test from "node:test";
import { buildTargetedRegeneration } from "../scripts/video-image-regenerate.mjs";

const plan={schema:"HIBOU_IMAGE_PLAN_V1",content_id:"recX",requests:[
 {candidate_id:"S01-C1",scene_id:"S01",candidate:1,seed:10,request:{prompt:"A",seed:10}},
 {candidate_id:"S01-C2",scene_id:"S01",candidate:2,seed:11,request:{prompt:"B",seed:11}},
 {candidate_id:"S02-C1",scene_id:"S02",candidate:1,seed:20,request:{prompt:"C",seed:20}}
]};
const qc={schema:"HIBOU_IMAGE_PERCEPTUAL_QC_V1",scene_summary:{
 S01:{needs_regeneration:true},S02:{needs_regeneration:false}
}};
test("targeted regeneration touches only failed scenes",()=>{
 const r=buildTargetedRegeneration(plan,qc,{attempt:2});
 assert.equal(r.requests.length,2);
 assert.equal(r.regeneration.failed_scenes.length,1);
 assert.equal(r.regeneration.failed_scenes[0],"S01");
 assert.equal(r.regeneration.untouched_scene_count,1);
 assert.ok(r.requests.every(x=>x.scene_id==="S01"));
 assert.equal(r.requests[0].seed,10+200006);
 assert.match(r.requests[0].candidate_id,/S01-R2-C1/);
 assert.match(r.requests[0].request.prompt,/corriger uniquement les défauts QC/);
});
test("invalid attempt fails closed",()=>{
 assert.throws(()=>buildTargetedRegeneration(plan,qc,{attempt:0}),/positive integer/);
});
