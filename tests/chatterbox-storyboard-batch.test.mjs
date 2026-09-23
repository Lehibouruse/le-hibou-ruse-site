import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

test("batch Chatterbox storyboard wrapper is syntaxically valid without loading model",()=>{
 const r=spawnSync("python3",["-m","py_compile","scripts/chatterbox-storyboard-batch.py"],{encoding:"utf8"});
 assert.equal(r.status,0,r.stderr||r.stdout);
});
test("voice batch has per-scene cache and no silent paid fallback",()=>{
 const source=readFileSync(new URL("../scripts/chatterbox-storyboard-batch.py",import.meta.url),"utf8");
 assert.match(source,/HIBOU_CHATTERBOX_SCENE_CACHE_V1/);
 assert.match(source,/fingerprint/);
 assert.match(source,/scene_cache_hits/);
 assert.match(source,/scene_cache_misses/);
 assert.match(source,/no silent CPU\/cloud fallback/);
 assert.match(source,/"paid_fallback": False/);
});
