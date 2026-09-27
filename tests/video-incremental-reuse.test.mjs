import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { seedIncrementalCaches } from "../scripts/video-master.mjs";

test("incremental cache seed copies reusable cache material into a different output root",()=>{
  const base=mkdtempSync(resolve(tmpdir(),"hibou-incremental-"));
  const previous=resolve(base,"previous");
  const current=resolve(base,"current");
  mkdirSync(resolve(previous,"voice","voice-scenes"),{recursive:true});
  mkdirSync(resolve(previous,"images","generated"),{recursive:true});
  mkdirSync(resolve(previous,".video-render-cache"),{recursive:true});
  mkdirSync(current,{recursive:true});

  writeFileSync(resolve(previous,"voice","voice-scenes","S01.wav"),"voice");
  writeFileSync(resolve(previous,"voice","voice-scenes","S01.manifest.json"),JSON.stringify({fingerprint:"x",wav_sha256:"y"}));
  const previousImage=resolve(previous,"images","generated","S01-C1.png");
  writeFileSync(previousImage,"image");
  writeFileSync(resolve(previous,"images","batch-manifest.json"),JSON.stringify({
    schema:"HIBOU_IMAGE_BATCH_V1",
    content_id:"recVideo",
    results:{
      "S01-C1":{status:"completed",outputs:[{path:previousImage}]}
    }
  }));
  writeFileSync(resolve(previous,".video-render-cache","scene-01-deadbeef.mp4"),"clip");

  const result=seedIncrementalCaches(previous,current);
  assert.equal(result.voice_scene_cache,true);
  assert.equal(result.image_manifest,true);
  assert.equal(result.copied_image_outputs,1);
  assert.equal(result.render_cache,true);
  assert.equal(existsSync(resolve(current,"voice","voice-scenes","S01.wav")),true);
  assert.equal(existsSync(resolve(current,".video-render-cache","scene-01-deadbeef.mp4")),true);

  const manifest=JSON.parse(readFileSync(resolve(current,"images","batch-manifest.json"),"utf8"));
  const copiedPath=manifest.results["S01-C1"].outputs[0].path;
  assert.equal(copiedPath,resolve(current,"images","generated","S01-C1.png"));
  assert.equal(readFileSync(copiedPath,"utf8"),"image");
  assert.equal(readFileSync(previousImage,"utf8"),"image");
});

test("incremental reuse refuses to seed a root from itself",()=>{
  const root=mkdtempSync(resolve(tmpdir(),"hibou-incremental-self-"));
  assert.throws(()=>seedIncrementalCaches(root,root),/different output root/);
});
