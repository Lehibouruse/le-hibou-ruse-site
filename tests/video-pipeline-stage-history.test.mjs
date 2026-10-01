import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const master = readFileSync(
  new URL("../scripts/video-master.mjs", import.meta.url),
  "utf8",
);

test("pipeline stage state preserves start finish duration and attempt", () => {
  assert.match(master, /state\.stage_history=Array\.isArray\(state\.stage_history\)/);
  assert.match(master, /entry\?\.stage===name&&entry\?\.event==="START"/);
  assert.match(master, /const attempt=/);
  assert.match(master, /started_at:startedAt/);
  assert.match(master, /finished_at:finishedAt/);
  assert.match(master, /duration_ms:durationMs/);
  assert.match(master, /attempt/);
});

test("stage history records START PASS and ERROR without changing PASS idempotency", () => {
  assert.match(master, /if\(state\.stages\[name\]\?\.status==="PASS"\) return false/);
  assert.match(master, /event:"START"/);
  assert.match(master, /event:"PASS"/);
  assert.match(master, /event:"ERROR"/);
  assert.match(master, /error:stageError\.slice\(0,2000\)/);
});

test("stage errors keep both head and tail diagnostics", () => {
  assert.match(master, /const head=fullError\.slice\(0,1200\)/);
  assert.match(master, /const tail=fullError\.length>1200\?fullError\.slice\(-6800\):""/);
  assert.match(master, /--- error tail ---/);
});
