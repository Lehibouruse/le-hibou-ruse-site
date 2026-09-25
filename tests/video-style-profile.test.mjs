import assert from "node:assert/strict";
import test from "node:test";
import { compileStyleProfile } from "../scripts/video-style-profile.mjs";
import { applyStyleProfile } from "../scripts/video-style-apply.mjs";

const entries=[
 {competitor:"A",source:"a",media:{duration_s:60},scene:{cut_count:24,median_scene_duration_s:2.4,mean_scene_duration_s:2.5},voice:{silence_ratio:.08,speaking_ratio:.92,mean_db:-16,max_db:-2}},
 {competitor:"A",source:"b",media:{duration_s:70},scene:{cut_count:28,median_scene_duration_s:2.3,mean_scene_duration_s:2.4},voice:{silence_ratio:.10,speaking_ratio:.90,mean_db:-15,max_db:-1}},
 {competitor:"B",source:"c",media:{duration_s:50},scene:{cut_count:20,median_scene_duration_s:2.5,mean_scene_duration_s:2.6},voice:{silence_ratio:.06,speaking_ratio:.94,mean_db:-17,max_db:-3}}
];
test("style compiler emits quantiles and bounded production defaults",()=>{
 const p=compileStyleProfile(entries,{minSources:3});
 assert.equal(p.schema,"HIBOU_VIDEO_STYLE_PROFILE_V1");
 assert.equal(p.source_count,3);
 assert.equal(p.competitor_count,2);
 assert.equal(p.overall.duration_s.median,60);
 assert.ok(p.production_profile.motion.default_zoom_percent>=2);
 assert.ok(p.production_profile.motion.default_zoom_percent<=4);
 assert.equal(p.production_profile.policy.copy_competitor_identity,false);
});
test("style application feeds renderer zoom without overwriting explicit scenes",()=>{
 const profile=compileStyleProfile(entries);
 const contract={contract_version:"HIBOU_VIDEO_CONTRACT_V1",scenes:[{scene_id:"S01"},{scene_id:"S02",zoom_percent:4}]};
 const out=applyStyleProfile(contract,profile);
 assert.equal(out.scenes[0].zoom_percent,profile.production_profile.motion.default_zoom_percent);
 assert.equal(out.scenes[1].zoom_percent,4);
 assert.equal(out.style_profile.source_count,3);
});
