import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const factory=readFileSync(
  new URL("../scripts/video-image-factory.mjs",import.meta.url),
  "utf8",
);
const master=readFileSync(
  new URL("../scripts/video-master.mjs",import.meta.url),
  "utf8",
);

test("factory result exposes aggregate technical QC diagnostics",()=>{
  assert.match(factory,/technical_qc:/);
  assert.match(factory,/failed_check_counts/);
  assert.match(factory,/dimensions:aggregateDimensions\(tech\)/);
  assert.match(factory,/min_width/);
  assert.match(factory,/min_height/);
});

test("factory result exposes aggregate perceptual reasons and warnings",()=>{
  assert.match(factory,/function aggregatePerceptual/);
  assert.match(factory,/reason_counts/);
  assert.match(factory,/warning_counts/);
  assert.match(factory,/perceptual_qc:aggregatePerceptual\(perceptual\)/);
});

test("video-master includes image QC diagnostics when images stage fails",()=>{
  assert.match(master,/diagnostics=/);
  assert.match(master,/technical_qc:result\.technical_qc/);
  assert.match(master,/perceptual_qc:result\.perceptual_qc/);
});
