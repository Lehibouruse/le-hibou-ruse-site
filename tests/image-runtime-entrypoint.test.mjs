import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const files=[
  "video-image-factory.mjs",
  "video-image-batch.mjs",
  "video-local-adapters.mjs",
  "video-image-plan.mjs",
  "video-image-qc.mjs",
  "video-image-regenerate.mjs",
];

for(const file of files){
  test(file+" uses portable Windows/Linux entrypoint detection",()=>{
    const src=readFileSync(new URL("../scripts/"+file,import.meta.url),"utf8");
    assert.match(src,/pathToFileURL/);
    assert.match(src,/pathToFileURL\(resolve\(process\.argv\[1\]\)\)\.href/);
    assert.doesNotMatch(src,/file:\/\/\$\{process\.argv\[1\]\}/);
  });
}
