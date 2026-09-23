import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";

test("batch Chatterbox storyboard wrapper is syntaxically valid without loading model",()=>{
  const r=spawnSync("python3",["-m","py_compile","scripts/chatterbox-storyboard-batch.py"],{encoding:"utf8"});
  assert.equal(r.status,0,r.stderr||r.stdout);
});
