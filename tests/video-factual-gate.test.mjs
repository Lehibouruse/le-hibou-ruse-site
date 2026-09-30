import assert from "node:assert/strict";
import test from "node:test";
import { assessFactualGate, FACTUAL_GATE_SCHEMA } from "../scripts/video-factual-gate.mjs";

function contract(){
 return {contract_version:"HIBOU_VIDEO_CONTRACT_V1",scenes:[
  {scene_id:"S01",condition:"Condition fiscale",source_label:"CGI art. X",jurisdiction:"FR",as_of_date:"2026-09-28"},
  {scene_id:"S02"}
 ]};
}
test("declared-only factual gate checks only explicit factual scenes",()=>{
 const r=assessFactualGate(contract());
 assert.equal(r.schema,FACTUAL_GATE_SCHEMA);
 assert.equal(r.status,"PASS");
 assert.equal(r.in_scope_scene_count,1);
 assert.equal(r.checks[1].status,"NOT_IN_SCOPE");
});
test("missing source jurisdiction or date rejects before promotion",()=>{
 const c=contract(); delete c.scenes[0].source_label;
 const r=assessFactualGate(c);
 assert.equal(r.status,"REJECT");
 assert(r.blockers.some(x=>x.field==="source_label"));
 assert.equal(r.policy.publication_authorized,false);
});
test("all-scenes mode requires metadata on every scene",()=>{
 const r=assessFactualGate(contract(),{mode:"all_scenes"});
 assert.equal(r.status,"REJECT");
 assert(r.blockers.some(x=>x.scene_id==="S02"));
});
test("invalid date format fails closed",()=>{
 const c=contract(); c.scenes[0].as_of_date="28/09/2026";
 const r=assessFactualGate(c);
 assert.equal(r.status,"REJECT");
 assert(r.blockers.some(x=>x.field==="as_of_date_invalid"));
});
test("gate never infers factuality from narration text",()=>{
 const c={contract_version:"HIBOU_VIDEO_CONTRACT_V1",scenes:[{scene_id:"S01",narration_exact:{text:"Article 150-0 B ter du CGI"}}]};
 const r=assessFactualGate(c);
 assert.equal(r.status,"PASS");
 assert.equal(r.in_scope_scene_count,0);
 assert(r.warnings.some(x=>x.code==="no_factual_scenes_declared"));
 assert.equal(r.policy.narration_semantics_not_inferred,true);
});
