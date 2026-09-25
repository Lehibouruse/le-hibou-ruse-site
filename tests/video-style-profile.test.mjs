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

test("style compiler separates attention cadence, composition change, captions, motion and asset reuse",()=>{
 const enriched=[
  {competitor:"A",source:"a",media:{duration_s:60},scene:{cut_count:20,median_scene_duration_s:2.8,mean_scene_duration_s:3,composition_change_interval_s:2.4,static_hold_ratio:.55,asset_reuse_rate:.62},voice:{silence_ratio:.05,speaking_ratio:.95,mean_db:-16,max_db:-2,words_per_minute:182,prosody_semitone_range:5.2},attention:{event_interval_s:1.9},captions:{median_duration_s:1.8,median_token_count:5},motion:{budget:.3}},
  {competitor:"B",source:"b",media:{duration_s:50},scene:{cut_count:18,median_scene_duration_s:2.5,mean_scene_duration_s:2.7,composition_change_interval_s:2.8,static_hold_ratio:.65},voice:{silence_ratio:.06,speaking_ratio:.94,mean_db:-17,max_db:-3,wpm:176,pitch_range_semitones:4.8},attention:{event_interval_s:2.1},captions:{duration_s:2.0,tokens_per_caption:6},motion:{budget:.25},assets:{reuse_rate:.7}}
 ];
 const p=compileStyleProfile(enriched,{minSources:2});
 assert.equal(p.overall.attention_event_interval_s.median,2);
 assert.equal(p.overall.composition_change_interval_s.median,2.6);
 assert.equal(p.overall.static_hold_ratio.median,.6);
 assert.equal(p.overall.asset_reuse_rate.median,.66);
 assert.equal(p.production_profile.visual_cadence.attention_event_interval_s,2);
 assert.equal(p.production_profile.captions.target_duration_s,1.9);
 assert.equal(p.production_profile.assets.target_reuse_rate,.66);
 assert.equal(p.production_profile.voice.target_wpm,179);
 assert.equal(p.production_profile.motion.target_motion_budget,.275);
});

test("missing advanced metrics stay null and never fabricate observations",()=>{
 const p=compileStyleProfile(entries);
 assert.equal(p.overall.attention_event_interval_s.n,0);
 assert.equal(p.production_profile.visual_cadence.attention_event_interval_s,null);
 assert.equal(p.production_profile.assets.target_reuse_rate,null);
 assert.equal(p.production_profile.voice.target_wpm,null);
});
