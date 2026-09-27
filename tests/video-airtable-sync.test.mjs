import assert from "node:assert/strict";
import test from "node:test";
import { buildStoryboardContract, buildContentResultFields, buildSceneResultFields } from "../scripts/video-airtable-sync.mjs";

function fakeScene(i,text,duration=1.8){
 return {id:`rec${i}`,fields:{Scène:`S${String(i).padStart(2,"0")}`,Ordre:i,Narration:text,"Idée visuelle":`visual ${i}`,"Prompt image":`prompt ${i}`,"Durée secondes":duration,"Zoom %":3,"Débit cible voix (mpm)":198,"Vitesse relative voix %":100,"Pause après (ms)":250}};
}
test("Airtable export reconstructs an exact 15-scene storyboard",()=>{
 const parts=Array.from({length:15},(_,i)=>`mot${i+1}`);
 const content={id:"recContent",fields:{Sujet:"Pilot",Script:parts.join(" "),"Version script":2}};
 const scenes=parts.map((p,i)=>fakeScene(i+1,p));
 const c=buildStoryboardContract(content,scenes);
 assert.equal(c.scenes.length,15);
 assert.equal(c.content.script_version,2);
 assert.equal(c.validation.publication_authorized,false);
 assert.equal(c.contract_state,"storyboard");
});
test("Airtable export refuses narration drift",()=>{
 const content={id:"recContent",fields:{Script:"a b c"}};
 const scenes=Array.from({length:15},(_,i)=>fakeScene(i+1,i===0?"wrong":"x"));
 assert.throws(()=>buildStoryboardContract(content,scenes),/does not reconstruct/);
});
test("render report never pretends local files are durable",()=>{
 const fields=buildContentResultFields({contract_version:"HIBOU_VIDEO_CONTRACT_V1",engine:{renderer_version:"v1"},qc:{status:"PASS",technical:{duration_s:42,sha256:"abc",size_bytes:123}},scenes:[{}]},"/tmp/manifest.json");
 assert.match(fields.Assets,/durable_upload_pending/);
 assert.equal(fields["État production vidéo"],"TECHNICAL_RENDER_PASS — HUMAN_REVIEW_REQUIRED");
});
test("scene report records hashes without URLs",()=>{
 const fields=buildSceneResultFields({measured_duration_s:2,render_artifact:{sha256:"abc"}});
 assert.match(fields["Motif QC"],/render_sha256=abc/);
 assert.equal(fields.Erreur,"");
});


test("specific storyboard scenes may run up to 12 seconds",()=>{
 const parts=Array.from({length:8},(_,i)=>`scene${i+1}`);
 const content={id:"recContent",fields:{Script:parts.join(" ")}};
 const scenes=parts.map((p,i)=>fakeScene(i+1,p,i===2?9:4));
 const c=buildStoryboardContract(content,scenes);
 assert.equal(c.scenes[2].planned_duration_s,9);
 assert.deepEqual(c.creative.pacing.scene_duration_allowed_s,[1.5,12]);
 assert.equal(c.content.method_version,"VIDEO_METHOD_V4.3");
});

test("storyboard still rejects pathological scene duration above 12 seconds",()=>{
 const parts=Array.from({length:8},(_,i)=>`scene${i+1}`);
 const content={id:"recContent",fields:{Script:parts.join(" ")}};
 const scenes=parts.map((p,i)=>fakeScene(i+1,p,i===2?12.1:4));
 assert.throws(()=>buildStoryboardContract(content,scenes),/duration must be 1\.5\.\.12 s/);
});
