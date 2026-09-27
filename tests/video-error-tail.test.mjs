import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const master = readFileSync(
  new URL("../scripts/video-master.mjs", import.meta.url),
  "utf8",
);
const worker = readFileSync(
  new URL("../scripts/hibou-github-worker.mjs", import.meta.url),
  "utf8",
);

test("video-master preserves both head and tail of long stage errors", () => {
  assert.match(master, /--- error tail ---/);
  assert.match(master, /fullError\.slice\(-6800\)/);
});

test("worker preserves the final traceback when reporting long failures", () => {
  assert.match(worker, /--- stage error tail ---/);
  assert.match(worker, /full\.slice\(-2800\)/);
  assert.match(worker, /--- worker error tail ---/);
  assert.match(worker, /fullMessage\.slice\(-4600\)/);
});
