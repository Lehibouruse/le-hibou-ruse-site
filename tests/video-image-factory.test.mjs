import assert from "node:assert/strict";
import test from "node:test";
import { factoryPolicy } from "../scripts/video-image-factory.mjs";

test("image factory defaults to one scene and one targeted regeneration",()=>{
 const p=factoryPolicy();
 assert.deepEqual(p,{max_scenes:1,max_regeneration_attempts:1,paid_fallback:false,human_review_required:true});
});
test("image factory caps scope and regeneration attempts",()=>{
 assert.throws(()=>factoryPolicy({maxScenes:21}),/1\.\.20/);
 assert.throws(()=>factoryPolicy({maxRegenerationAttempts:3}),/0\.\.2/);
 assert.equal(factoryPolicy({maxScenes:5,maxRegenerationAttempts:2}).max_scenes,5);
});
