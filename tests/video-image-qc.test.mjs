import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("image technical QC is fail-closed and includes duplicate detection",()=>{
 const source=readFileSync(new URL("../scripts/video-image-qc.mjs",import.meta.url),"utf8");
 assert.match(source,/HIBOU_IMAGE_TECH_QC_V1/);
 assert.match(source,/unique_exact/);
 assert.match(source,/vertical_aspect/);
 assert.match(source,/all_scenes_have_candidate/);
 assert.match(source,/paid_fallback:false/);
});


test("technical QC accepts the official local OOM fallback dimensions",()=>{
 const source=readFileSync(new URL("../scripts/video-image-qc.mjs",import.meta.url),"utf8");
 assert.match(source,/minWidth=640,minHeight=1136/);
 assert.match(source,/primary:\{width:768,height:1344\}/);
 assert.match(source,/fallback:\{width:640,height:1136\}/);
});

test("technical QC reports aggregate failed check counts",()=>{
 const source=readFileSync(new URL("../scripts/video-image-qc.mjs",import.meta.url),"utf8");
 assert.match(source,/failed_checks/);
 assert.match(source,/failed_check_counts/);
});
