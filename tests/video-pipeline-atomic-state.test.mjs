import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const master = readFileSync(
  new URL("../scripts/video-master.mjs", import.meta.url),
  "utf8",
);

test("pipeline JSON writes are atomic so resume state cannot be left half-written", () => {
  assert.match(master, /renameSync/);
  assert.match(master, /\.tmp-\$\{process\.pid\}-\$\{Date\.now\(\)\}/);
  assert.match(master, /writeFileSync\(temp,JSON\.stringify\(value,null,2\)\+"\\n"\)/);
  assert.match(master, /renameSync\(temp,target\)/);
  assert.match(master, /if\(existsSync\(temp\)\) unlinkSync\(temp\)/);
});
