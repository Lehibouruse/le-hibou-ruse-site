import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const route = readFileSync(
  new URL("../app/api/local-worker-queue/route.js", import.meta.url),
  "utf8",
);

test("pending VIDEO_RENDER queue is ordered High then Normal then Low", () => {
  assert.match(route, /\["High", 0\]/);
  assert.match(route, /\["Normal", 1\]/);
  assert.match(route, /\["Low", 2\]/);
  assert.match(route, /aPriority - bPriority/);
});

test("queue ordering uses created time as second criterion", () => {
  assert.match(route, /Cr\\u00e9\\u00e9 le/);
  assert.match(route, /aTime - bTime/);
});

test("queue ordering has stable record id tie-break", () => {
  assert.match(route, /localeCompare\(String\(b\.id \|\| ""\)\)/);
});

test("route inspects a wider pending window and stops after five valid ordered jobs", () => {
  assert.match(route, /pageSize: 50/);
  assert.match(route, /const records = sortPendingRecords\(pendingRecords\)/);
  assert.match(route, /if \(jobs\.length >= 5\) break/);
});
