import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const master = readFileSync(
  new URL("../scripts/video-master.mjs", import.meta.url),
  "utf8",
);

test("video-master uses a portable Windows/Linux entrypoint guard", () => {
  assert.match(master, /pathToFileURL/);
  assert.match(master, /pathToFileURL\(resolve\(process\.argv\[1\]\)\)\.href/);
  assert.doesNotMatch(master, /file:\/\/\$\{process\.argv\[1\]\}/);
});
