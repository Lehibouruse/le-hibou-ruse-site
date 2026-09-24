import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { airtableSmokeFields, summarizeSmoke } from "../scripts/video-airtable-smoke-report.mjs";

test("smoke summary distinguishes a one-scene pass from a full pipeline pass",()=>{
  const root=mkdtempSync(resolve(tmpdir(),"hibou-smoke-report-"));
  mkdirSync(resolve(root,"voice"),{recursive:true});
  mkdirSync(resolve(root,"images"),{recursive:true});
  const storyboard=resolve(root,"storyboard-one-scene.json");
  writeFileSync(storyboard,JSON.stringify({
    content:{content_id:"rec123"},
    scenes:[{scene_id:"S01",source_scene_record_id:"scene123"}]
  }));
  writeFileSync(resolve(root,"smoke-prep.json"),JSON.stringify({
    storyboard,scene_id:"S01",source_scene_order:1
  }));
  writeFileSync(resolve(root,"voice","voice-batch-manifest.json"),JSON.stringify({
    master:"voice.wav",master_sha256:"abc",duration_s:1.2,scene_cache_hits:0,scene_cache_misses:1
  }));
  writeFileSync(resolve(root,"images","batch-manifest.json"),JSON.stringify({results:{
    a:{status:"completed"},b:{status:"completed"},c:{status:"completed"}
  }}));
  const s=summarizeSmoke(root);
  assert.equal(s.status,"SMOKE_PASS");
  assert.equal(s.full_pipeline_completed,false);
  assert.equal(s.publication_authorized,false);
  const f=airtableSmokeFields(s);
  assert.match(f.content["État production vidéo"],/FULL_PIPELINE_NOT_RUN/);
  assert.match(f.scene["Motif QC"],/publication locked/);
});
