import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const source=readFileSync(new URL("../scripts/video-creative-qc.py",import.meta.url),"utf8");

test("creative QC Python is syntactically valid without loading a model",()=>{
  const r=spawnSync("python3",["-m","py_compile","scripts/video-creative-qc.py"],{encoding:"utf8"});
  assert.equal(r.status,0,r.stderr||r.stdout);
});

test("creative QC is local-only, explainable and never auto-publishes",()=>{
  assert.match(source,/HIBOU_CREATIVE_QC_V1/);
  assert.match(source,/local_files_only/);
  assert.match(source,/paid_fallback.*False/);
  assert.match(source,/human_review_required.*True/);
  assert.match(source,/auto_publish_allowed.*False/);
  assert.match(source,/semantic mismatch/);
  assert.match(source,/style drift/);
  assert.match(source,/canonical Hibou drift/);
});

test("creative QC checks expected Hibou, unexpected animal and parasitic text risk",()=>{
  assert.match(source,/expected_hibou is True/);
  assert.match(source,/expected_hibou is False/);
  assert.match(source,/text_artifact_risk/);
  assert.match(source,/openai\/clip-vit-base-patch32/);
});
