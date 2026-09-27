import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
const master=readFileSync(new URL("../scripts/video-master.mjs",import.meta.url),"utf8");
const sync=readFileSync(new URL("../scripts/video-airtable-sync.mjs",import.meta.url),"utf8");
const promote=readFileSync(new URL("../scripts/video-storyboard-promote.mjs",import.meta.url),"utf8");

test("V5 execution needs both GLOBAL contract feature and local runtime gate",()=>{
 assert.match(master,/contract\?\.features\?\.\[name\]===true && envFlag\(envName\)/);
 for(const name of ["HIBOU_VIDEO_PROSODY_V1","HIBOU_VIDEO_MUSIC_V1","HIBOU_VIDEO_CREATIVE_QC_V1"]) assert.match(master,new RegExp(name));
});

test("Airtable export separates GLOBAL feature/music configuration from scene-specific events",()=>{
 assert.match(sync,/features:\{/);
 assert.match(sync,/video_pose_registry_v1/);
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
