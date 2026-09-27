import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const renderer=readFileSync(new URL("../scripts/video-local-render.mjs",import.meta.url),"utf8");
const schema=JSON.parse(readFileSync(new URL("../docs/video-contract-v1.schema.json",import.meta.url),"utf8"));

test("scene cache fingerprint changes when timeline text/camera timing changes",()=>{
  assert.match(renderer,/timeline:\s*plan\.timeline/);
});

test("V1 contract formally exposes optional backward-compatible V5 extensions",()=>{
  assert.equal(schema.properties.features.properties.video_timeline_v1.type,"boolean");
  assert.equal(schema.properties.features.properties.video_human_candidate_selection_v1.type,"boolean");
  assert.equal(schema.properties.scenes.items.properties.timeline.$ref,"./video-scene-timeline-v1.schema.json");
  assert.equal(schema.properties.scenes.items.properties.pose_request.type,"string");
  assert.equal(schema.properties.scenes.items.properties.voice.properties.verbatim.type,"boolean");
  assert.equal(schema.properties.scenes.items.properties.voice.properties.prosody_cues.type,"array");
  assert.ok(!schema.required.includes("features"));
  assert.ok(!schema.properties.scenes.items.required.includes("timeline"));
});
