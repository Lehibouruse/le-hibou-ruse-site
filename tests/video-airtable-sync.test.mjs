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


test("Airtable export remains FINAL and incremental-off before the prepared migration is applied",()=>{
 const parts=Array.from({length:8},(_,i)=>`safe${i+1}`);
 const content={id:"recContent",fields:{Script:parts.join(" ")}};
 const scenes=parts.map((p,i)=>fakeScene(i+1,p,4));
 const c=buildStoryboardContract(content,scenes,{fields:{}});
 assert.equal(c.production.mode,"final");
 assert.equal(c.production.preview_candidates_per_scene,1);
 assert.equal(c.features.video_incremental_retouch_v1,false);
 assert.equal(c.features.video_human_candidate_selection_v1,false);
 assert.equal(c.validation.publication_authorized,false);
});

test("Airtable profile can prepare preview mode without authorizing publication",()=>{
 const parts=Array.from({length:8},(_,i)=>`preview${i+1}`);
 const content={id:"recContent",fields:{Script:parts.join(" ")}};
 const scenes=parts.map((p,i)=>fakeScene(i+1,p,4));
 const profile={fields:{
   "Mode production par défaut":"preview",
   "Retouches incrémentales V1":true,
   "Sélection humaine candidats V1":true,
   "Candidats par scène":3
 }};
 const c=buildStoryboardContract(content,scenes,profile);
 assert.equal(c.production.mode,"preview");
 assert.equal(c.production.final_candidates_per_scene,3);
 assert.equal(c.production.preview_candidates_per_scene,1);
 assert.equal(c.features.video_incremental_retouch_v1,true);
 assert.equal(c.features.video_human_candidate_selection_v1,true);
 assert.equal(c.validation.publication_authorized,false);
});


test("Airtable export carries explicit continuity and roadmap metadata without activating runtime behavior",()=>{
 const parts=Array.from({length:8},(_,i)=>`meta${i+1}`);
 const content={id:"recContent",fields:{Script:parts.join(" ")}};
 const scenes=parts.map((p,i)=>{
   const scene=fakeScene(i+1,p,4);
   if(i<3) scene.fields["Groupe visuel"]="office-a";
   if(i===0){
     scene.fields["Exigences assets JSON"]=JSON.stringify([
       {slot:"background",kind:"background",required_tags:["office"]}
     ]);
     scene.fields["Timeline JSON"]=JSON.stringify({
       events:[{type:"caption",at_s:0.5}]
     });
     scene.fields["Prosodie JSON"]=JSON.stringify([
       {phrase:p,pause_after_ms:100}
     ]);
     scene.fields["Pose Hibou"]="neutral";
   }
   return scene;
 });
 const profile={fields:{
   "Profil densité voix":{name:"EXPLAINER_DENSE"},
   "Profil mouvement":{name:"HYBRID_BEATS"},
   "Courbe cadence":{name:"HOOK_FAST_BODY_ADAPTIVE_CTA_OPTIONAL_BOOST"},
   "Prompt Graph V1":false
 }};
 const c=buildStoryboardContract(content,scenes,profile);
 assert.equal(c.scenes[0].visual_group,"office-a");
 assert.equal(c.scenes[0].asset_requirements[0].slot,"background");
 assert.equal(c.scenes[0].timeline.events[0].type,"caption");
 assert.equal(c.scenes[0].voice.prosody_cues[0].pause_after_ms,100);
 assert.equal(c.scenes[0].pose_request,"neutral");
 assert.equal(c.audio.density_profile,"EXPLAINER_DENSE");
 assert.equal(c.audio.density_profile_runtime_applied,false);
 assert.equal(c.creative.movement_profile,"HYBRID_BEATS");
 assert.equal(c.creative.curve_profile,"HOOK_FAST_BODY_ADAPTIVE_CTA_OPTIONAL_BOOST");
 assert.equal(c.features.video_prompt_graph_v1,false);
});

test("malformed V5 JSON fails closed instead of silently disappearing",()=>{
 const parts=Array.from({length:8},(_,i)=>`json${i+1}`);
 const content={id:"recContent",fields:{Script:parts.join(" ")}};
 const scenes=parts.map((p,i)=>fakeScene(i+1,p,4));
 scenes[0].fields["Timeline JSON"]="{bad";
 assert.throws(
   ()=>buildStoryboardContract(content,scenes,{fields:{}}),
   /Timeline JSON contains invalid JSON/
 );

 scenes[0].fields["Timeline JSON"]="";
 scenes[0].fields["Exigences assets JSON"]="{not-an-array}";
 assert.throws(
   ()=>buildStoryboardContract(content,scenes,{fields:{}}),
   /Exigences assets JSON/
 );
});
