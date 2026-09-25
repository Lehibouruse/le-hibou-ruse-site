import assert from "node:assert/strict";
import test from "node:test";
import { buildTechnicalSelections, masterPolicy } from "../scripts/video-master.mjs";

test("master orchestrator is bounded and publication locked",()=>{
 const p=masterPolicy();
 assert.equal(p.max_scenes,20);
 assert.equal(p.regeneration_attempts,1);
 assert.equal(p.publication_authorized,false);
 assert.equal(p.human_master_review_required,true);
 assert.equal(p.paid_fallback,false);
});
test("master policy refuses unbounded runs",()=>{
 assert.throws(()=>masterPolicy({maxScenes:26}),/1\.\.25/);
 assert.throws(()=>masterPolicy({regenAttempts:3}),/0\.\.2/);
});
test("technical selections promote only QC PASS provisional candidates",()=>{
 const s=buildTechnicalSelections({
   S01:{status:"PROVISIONAL_QC_PASS",selected_path:"a.png"},
   S02:{status:"PROVISIONAL_QC_PASS",selected_path:"b.png"}
 });
 assert.equal(s.S01.selected,"a.png");
 assert.match(s.S01.selection_reason,/final master human review required/);
 assert.throws(()=>buildTechnicalSelections({S01:{status:"NO_PASS",selected_path:null}}),/no QC PASS image/);
});
