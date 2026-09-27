import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
const master=readFileSync(new URL("../scripts/video-master.mjs",import.meta.url),"utf8");
const sync=readFileSync(new URL("../scripts/video-airtable-sync.mjs",import.meta.url),"utf8");
const promote=readFileSync(new URL("../scripts/video-storyboard-promote.mjs",import.meta.url),"utf8");
const worker=readFileSync(new URL("../scripts/hibou-github-worker.mjs",import.meta.url),"utf8");

test("V5 execution needs both GLOBAL contract feature and local runtime gate",()=>{
 assert.match(master,/contract\?\.features\?\.\[name\]===true && envFlag\(envName\)/);
 for(const name of ["HIBOU_VIDEO_TIMELINE_V1","HIBOU_VIDEO_PROSODY_V1","HIBOU_VIDEO_MUSIC_V1","HIBOU_VIDEO_CREATIVE_QC_V1","HIBOU_VIDEO_POSE_REGISTRY_V1","HIBOU_VIDEO_INCREMENTAL_RETOUCH_V1"]) assert.match(master,new RegExp(name));
});

test("Airtable export separates GLOBAL feature/music configuration from scene-specific events",()=>{
 assert.match(sync,/features:\{/);
 assert.match(sync,/video_pose_registry_v1/);
 assert.match(sync,/video_incremental_retouch_v1/);
 assert.match(sync,/Mode production par défaut/);
 assert.match(sync,/Timeline JSON/);
 assert.match(sync,/Prosodie JSON/);
 assert.match(sync,/Pose Hibou/);
 assert.match(sync,/GLOBAL only/);
});

test("promotion copies timed object and pose assets before render",()=>{
 assert.match(promote,/scene\?\.timeline\?\.events/);
 assert.match(promote,/\["object","pose"\]/);
 assert.match(promote,/timeline-\$\{index\+1\}/);
});

test("pose registry is commit-pinned and applied before asset resolution",()=>{
 assert.match(master,/video-hibou-pose-registry\.mjs/);
 assert.match(master,/video\/assets\/hibou-poses\.registry\.v1\.json/);
 assert.match(master,/stage\(state,"pose_registry"/);
 assert.ok(master.indexOf('stage(state,"pose_registry"') < master.indexOf('stage(state,"asset_resolution"'));
});

test("scene timeline cannot override a disabled GLOBAL timeline feature",()=>{
 assert.match(master,/delete scene\.timeline/);
 assert.match(master,/video_timeline_v1","HIBOU_VIDEO_TIMELINE_V1/);
 assert.match(master,/stripped_scene_count/);
});


test("incremental reuse is opt-in, commit-pinned and never authorizes publication",()=>{
 assert.match(master,/video-iteration-plan\.mjs/);
 assert.match(master,/--reuse-from requires GLOBAL video_incremental_retouch_v1/);
 assert.match(master,/seedIncrementalCaches/);
 assert.match(master,/publication_authorized:false/);
});


test("remote queue preview policy reaches the local master without changing scene GLOBAL identity",()=>{
 assert.match(worker,/--production-mode=\$\{productionMode\}/);
 assert.match(worker,/--candidates-per-scene=\$\{candidatesPerScene\}/);
 assert.match(worker,/job\.options\?\.preview_mode === true/);
 assert.match(master,/execution_override:executionOverride/);
 assert.match(master,/global_visual_identity_unchanged:true/);
 assert.match(master,/publication_authorized:false/);
});
