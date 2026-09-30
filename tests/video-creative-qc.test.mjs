import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const source=readFileSync(new URL("../scripts/video-creative-qc.py",import.meta.url),"utf8");

test("creative QC Python is syntactically valid without loading a model",()=>{
  const command=process.platform==="win32"?"py":"python3";
  const args=process.platform==="win32"?["-3.11","-m","py_compile","scripts/video-creative-qc.py"]:["-m","py_compile","scripts/video-creative-qc.py"];
  const r=spawnSync(command,args,{encoding:"utf8"});
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

test("creative QC covers long visual briefs in multiple CLIP-sized chunks",()=>{
  assert.match(source,/def chunk_text/);
  assert.match(source,/def chunked_similarity/);
  assert.match(source,/semantic_brief_min_chunk/);
  assert.match(source,/semantic_brief_chunks/);
  assert.doesNotMatch(source,/scores\["semantic_brief"\]\s*=\s*sim01\(image,\s*text_embedding\([^\n]*brief\)/);
});
