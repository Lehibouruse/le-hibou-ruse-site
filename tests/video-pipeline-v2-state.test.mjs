import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { inspectPipeline } from "../scripts/video-pipeline-state.mjs";
import { buildRegistry } from "../scripts/video-artifact-registry.mjs";
import { spawnSync } from "node:child_process";

test("pipeline state stops at human image selection after 3 candidates per scene",()=>{
 const root=mkdtempSync(resolve(tmpdir(),"hibou-state-")); mkdirSync(resolve(root,"voice"),{recursive:true}); mkdirSync(resolve(root,"images"),{recursive:true});
 writeFileSync(resolve(root,"storyboard.json"),JSON.stringify({scenes:[{scene_id:"s1"}]}));
 writeFileSync(resolve(root,"voice/contract-audio-ready.json"),"{}"); writeFileSync(resolve(root,"voice/contract-mastered.json"),"{}"); writeFileSync(resolve(root,"subtitles.ass"),"x");
 writeFileSync(resolve(root,"images/image-plan.json"),"{}");
 writeFileSync(resolve(root,"images/batch-manifest.json"),JSON.stringify({results:{a:{status:"completed"},b:{status:"completed"},c:{status:"completed"}}}));
 writeFileSync(resolve(root,"images/selections.json"),JSON.stringify({s1:{candidates:["a","b","c"],selected:null}}));
 const s=inspectPipeline(root); assert.equal(s.gate,"HUMAN_IMAGE_SELECTION"); assert.equal(s.publication_authorized,false);
});
test("artifact registry hashes files and never invents durable URLs",()=>{
 const root=mkdtempSync(resolve(tmpdir(),"hibou-reg-")); const p=resolve(root,"a.bin"); writeFileSync(p,"abc");
 const r=buildRegistry([{kind:"master",path:p}]); assert.equal(r.entries.length,1); assert.equal(r.entries[0].durable_url,null); assert.equal(r.entries[0].sha256.length,64);
});
test("optional DINOv2 rank wrapper is syntax-valid without downloading model",()=>{
 const r=spawnSync("python3",["-m","py_compile","scripts/video-dinov2-rank.py"],{encoding:"utf8"}); assert.equal(r.status,0,r.stderr);
});
