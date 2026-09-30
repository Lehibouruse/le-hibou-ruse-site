import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { TABLES } from "../lib/airtable.js";
import { buildServerAirtableSourceSnapshot } from "../scripts/video-airtable-source-snapshot.mjs";
import {
  buildStoryboardContract,
  parseSpecificV2SceneAddenda,
  verifyAirtableStoryboardFreshness,
  verifyAirtableStoryboardSnapshot
} from "../scripts/video-airtable-sync.mjs";
import { main as videoMasterMain } from "../scripts/video-master.mjs";
import { scopeStoryboardForJob } from "../scripts/video-storyboard-scope.mjs";

const CONTENT_ID="rec00000000000001";
const PROFILE_ID="rec00000000000002";
const V1="BRIEF SPÉCIFIQUE V1 — Lombard vs Box Spread.";
const V2=`${V1}\n\nADDITIF SPÉCIFIQUE V2 — PRÉSERVATION DE LA LOGIQUE DE MONTAGE.\n`+
  [
    "SCÈNE 5 — base taux de marché ; couche de marge +1 % ; variante +1,5 % ; calendrier annuel.",
    "SCÈNE 7 — quatre options distinctes convergent vers un seul financement.",
    "SCÈNE 8 — split-screen cash aujourd’hui et remboursement connu à l’échéance.",
    "SCÈNE 9 — comparaison Lombard/Box avec disparition visible de la marge.",
    "SCÈNE 10 — 2026→2027→2028→2029, renouvellement successif des box.",
    "SCÈNE 11 — Marché→Banque→Toi contre Marché→Toi.",
    "SCÈNE 12 — le Hibou efface la banque puis simplifie le circuit."
  ].join("\n")+"\n\nRÈGLE DE QUALITÉ : préserver le mécanisme.";

function fixture(brief=V2){
  const scenes=Array.from({length:13},(_,i)=>({
    id:`rec${String(100+i).padStart(14,"0")}`,
    fields:{
      Scène:`S${String(i+1).padStart(2,"0")}`,
      Ordre:i+1,
      Narration:`phrase${i+1}`,
      "Idée visuelle":`idée visuelle source ${i+1}`,
      "Prompt image":`image source ${i+1}`,
      "Texte écran":`TEXTE ${i+1}`,
      "Durée secondes":4,
      "Zoom %":2
    }
  }));
  scenes[6].fields["Candidats JSON"]=JSON.stringify({
    candidates:[{path:"candidate-7.png",score:87}],
    selected_path:"candidate-7.png"
  });
  const profile={id:PROFILE_ID,fields:{
    Profil:"HIBOU_VIRAL_V1",
    Version:"2.5-V4.3",
    Actif:true,
    Description:"Profil global canonique",
    "Style lock":"2D premium",
    "Negative prompt":"no humans",
    "Character lock Hibou":"canonical owl",
    Voix:"VOICE_V4_ORIGINAL — French natural voice",
    "Politique musique":"no unlicensed music",
    "Durée min scène":2.8,
    "Durée max scène":5
  }};
  const content={id:CONTENT_ID,fields:{
    Sujet:"Lombard vs Box Spread",
    Script:scenes.map(scene=>scene.fields.Narration).join(" "),
    "Version script":3,
    "Prompt / consignes":brief,
    "Profil vidéo":[PROFILE_ID],
    "Scènes vidéo":scenes.map(scene=>scene.id)
  }};
  const records=new Map([
    [`${TABLES.content}/${CONTENT_ID}`,content],
    [`${TABLES.videoProfiles}/${PROFILE_ID}`,profile],
    ...scenes.map(scene=>[`${TABLES.videoScenes}/${scene.id}`,scene])
  ]);
  const loadRecord=async (table,id)=>{
    const record=records.get(`${table}/${id}`);
    if(!record) throw new Error("source unavailable");
    return record;
  };
  return {content,profile,scenes,records,loadRecord};
}

function sourceSnapshot(fixtureData,capturedAt=new Date().toISOString()){
  return {
    schema:"HIBOU_AIRTABLE_SOURCE_SNAPSHOT_V1",
    capture_method:"codex_airtable_connector",
    base_id:"appWyUX7TYPNrDbyP",
    captured_at:capturedAt,
    content_id:CONTENT_ID,
    profile_record_id:PROFILE_ID,
    content:fixtureData.content,
    profile:fixtureData.profile,
    scenes:fixtureData.scenes
  };
}

test("V2 instructions are added to matching visual ideas while image prompts remain intact",()=>{
  const {content,profile,scenes}=fixture();
  const addenda=parseSpecificV2SceneAddenda(content.fields["Prompt / consignes"]);
  assert.deepEqual([...addenda.keys()],[5,7,8,9,10,11,12]);
  const board=buildStoryboardContract(content,scenes,profile);
  for(const order of [5,7,8,9,10,11,12]){
    const scene=board.scenes[order-1];
    assert.match(scene.visual_idea,new RegExp(`idée visuelle source ${order}`));
    assert.match(scene.visual_idea,/ADDITIF SPÉCIFIQUE V2 — MONTAGE/);
    assert.equal(scene.image_prompt,`image source ${order}`);
  }
  assert.equal(board.scenes[3].visual_idea,"idée visuelle source 4");
  assert.equal(board.creative.content_brief,V2);
  assert.match(board.creative.content_brief_sha256,/^[0-9a-f]{64}$/);
  assert.equal(board.content.source_fingerprints.scene_count,13);
  assert.equal(board.scenes[6].image.source_selected_path,"candidate-7.png");
  assert.equal(board.scenes[6].image.selected,null);
  assert.equal(board.scenes[6].image.candidates.length,1);
});

test("linked 13 scenes override a stale nine-scene JSON draft",()=>{
  const {content,profile,scenes}=fixture();
  content.fields["Scènes JSON"]=JSON.stringify({contract_version:"HIBOU_VIDEO_CONTRACT_V4_DRAFT",
    scenes:Array.from({length:9},(_,index)=>({scene_id:`OLD${index+1}`,narration:"obsolete"}))});
  const board=buildStoryboardContract(content,scenes,profile);
  assert.equal(board.scenes.length,13);
  assert.equal(board.scenes[0].scene_id,"S01");
  assert.deepEqual(board.content.source_warnings,[{
    code:"LEGACY_SCENES_JSON_STALE_IGNORED",field:"Scènes JSON",authoritative_field:"Scènes vidéo",
    legacy_scene_count:9,linked_scene_count:13
  }]);
  const snapshot=sourceSnapshot({content,profile,scenes});
  assert.equal(verifyAirtableStoryboardSnapshot(board,snapshot).pass,true);
  const updated=structuredClone(snapshot);
  updated.content.fields["Scènes JSON"]="obsolete but unparsable";
  assert.equal(verifyAirtableStoryboardSnapshot(board,updated).pass,true);
});

test("live Airtable source check accepts current export and rejects changed global, brief and scenes",async()=>{
  const {content,profile,scenes,loadRecord}=fixture();
  const board=buildStoryboardContract(content,scenes,profile);
  assert.equal((await verifyAirtableStoryboardFreshness(board,{loadRecord})).pass,true);
  const jobOverride=structuredClone(board);
  jobOverride.production.mode="preview";
  jobOverride.production.candidates_per_scene=1;
  assert.equal((await verifyAirtableStoryboardFreshness(jobOverride,{loadRecord})).pass,true);
  const oldBrief=buildStoryboardContract({...content,fields:{...content.fields,"Prompt / consignes":V1}},scenes,profile);
  await assert.rejects(
    verifyAirtableStoryboardFreshness(oldBrief,{loadRecord}),
    /Airtable storyboard source drift:.*specific_sha256.*scenes_sha256/
  );
  const oldNegative=structuredClone(board);
  oldNegative.creative.negative_prompt="older negative prompt";
  delete oldNegative.content.source_fingerprints;
  await assert.rejects(
    verifyAirtableStoryboardFreshness(oldNegative,{loadRecord}),
    /global_sha256/
  );
  const oldVersion=structuredClone(board);
  oldVersion.content.profile_version="2.4-V4.2";
  delete oldVersion.content.source_fingerprints;
  await assert.rejects(
    verifyAirtableStoryboardFreshness(oldVersion,{loadRecord}),
    /global_sha256/
  );
  const oldScene=structuredClone(board);
  oldScene.scenes[0].image_prompt="obsolete image prompt";
  delete oldScene.content.source_fingerprints;
  await assert.rejects(
    verifyAirtableStoryboardFreshness(oldScene,{loadRecord}),
    /scenes_sha256/
  );
  await assert.rejects(
    verifyAirtableStoryboardFreshness(board,{loadRecord:async()=>{throw new Error("Airtable offline");}}),
    /Airtable offline/
  );
});

test("one-hour connector snapshot is explicit, bounded and field-complete",()=>{
  const live=fixture();
  const board=buildStoryboardContract(live.content,live.scenes,live.profile);
  const snapshot=sourceSnapshot(live);
  const receipt=verifyAirtableStoryboardSnapshot(board,snapshot);
  assert.equal(receipt.pass,true);
  assert.equal(receipt.source,"airtable_connector_snapshot");
  assert.equal(receipt.live_at_run,false);
  assert.equal(receipt.captured_at,snapshot.captured_at);
  const serverSnapshot={...snapshot,capture_method:"server_airtable_live"};
  const serverReceipt=verifyAirtableStoryboardSnapshot(board,serverSnapshot);
  assert.equal(serverReceipt.pass,true);
  assert.equal(serverReceipt.source,"airtable_server_snapshot");
  assert.equal(serverReceipt.live_at_run,false);
  const older=sourceSnapshot(live,new Date(Date.now()-3_600_001).toISOString());
  assert.throws(()=>verifyAirtableStoryboardSnapshot(board,older),/expired/);
  assert.throws(()=>verifyAirtableStoryboardSnapshot(board,null),/snapshot schema/);
  const changedProfile=structuredClone(snapshot);
  changedProfile.profile.fields["Negative prompt"]="changed";
  assert.throws(()=>verifyAirtableStoryboardSnapshot(board,changedProfile),/global_sha256/);
  const changedScene=structuredClone(snapshot);
  changedScene.scenes[4].fields["Idée visuelle"]="changed";
  assert.throws(()=>verifyAirtableStoryboardSnapshot(board,changedScene),/scenes_sha256/);
});

test("snapshot verification covers factual scene fields, timeline, source candidates and QC policy",()=>{
  const live=fixture();
  const board=buildStoryboardContract(live.content,live.scenes,live.profile);
  const snapshot=sourceSnapshot(live);
  for(const field of ["persona_case","qualify","disqualify","condition","risk","source_label","jurisdiction","as_of_date"]){
    const changed=structuredClone(board);
    changed.scenes[0][field]=`changed ${field}`;
    delete changed.content.source_fingerprints;
    assert.throws(()=>verifyAirtableStoryboardSnapshot(changed,snapshot),/scenes_sha256/,field);
  }
  const timeline=structuredClone(board);
  timeline.scenes[0].timeline={events:[{id:"inserted",type:"text",start_s:0,end_s:1,text:"wrong"}]};
  delete timeline.content.source_fingerprints;
  assert.throws(()=>verifyAirtableStoryboardSnapshot(timeline,snapshot),/scenes_sha256/);
  const candidates=structuredClone(board);
  candidates.scenes[6].image.candidates[0].path="untrusted.png";
  delete candidates.content.source_fingerprints;
  assert.throws(()=>verifyAirtableStoryboardSnapshot(candidates,snapshot),/scenes_sha256/);
  const selectedPath=structuredClone(board);
  selectedPath.scenes[6].image.source_selected_path="untrusted.png";
  delete selectedPath.content.source_fingerprints;
  assert.throws(()=>verifyAirtableStoryboardSnapshot(selectedPath,snapshot),/scenes_sha256/);
  const creativeQc=structuredClone(board);
  creativeQc.creative.creative_qc.model="changed-model";
  delete creativeQc.content.source_fingerprints;
  assert.throws(()=>verifyAirtableStoryboardSnapshot(creativeQc,snapshot),/global_sha256/);
});

test("source snapshot verifies a partial preview against the complete Airtable scene list",()=>{
  const live=fixture();
  const full=buildStoryboardContract(live.content,live.scenes,live.profile);
  const scoped=scopeStoryboardForJob(full,{maxScenes:5,mode:"preview"});
  const server=buildServerAirtableSourceSnapshot(live.content,live.profile,live.scenes);
  const receipt=verifyAirtableStoryboardSnapshot(scoped,server);
  assert.equal(receipt.pass,true);
  assert.equal(receipt.source,"airtable_server_snapshot");
  assert.equal(receipt.scene_count,5);
  const altered=structuredClone(scoped);
  altered.render_scope.scene_ids[0]="S99";
  assert.throws(()=>verifyAirtableStoryboardSnapshot(altered,sourceSnapshot(live)),/render scope/);
  const stale=structuredClone(scoped);
  stale.scenes[2].image_prompt="obsolete";
  assert.throws(()=>verifyAirtableStoryboardSnapshot(stale,sourceSnapshot(live)),/scenes_sha256/);
});

test("video-master refuses a stale Airtable storyboard before reference, image or GPU stages",async()=>{
  const live=fixture();
  const stale=fixture(V1);
  const board=buildStoryboardContract(stale.content,stale.scenes,stale.profile);
  const dir=mkdtempSync(join(tmpdir(),"hibou-source-freshness-"));
  const input=join(dir,"local-storyboard.json");
  const binding=join(dir,"dummy-binding.json");
  const snapshotPath=join(dir,"source-snapshot.json");
  const output=join(dir,"run");
  writeFileSync(input,JSON.stringify(board));
  writeFileSync(binding,"{}\n");
  writeFileSync(snapshotPath,JSON.stringify(sourceSnapshot(live)));
  const previousArgv=process.argv;
  const previousToken=process.env.AIRTABLE_TOKEN;
  process.argv=[process.execPath,resolve("scripts/video-master.mjs"),`--storyboard=${input}`,`--source-snapshot=${snapshotPath}`,`--binding=${binding}`,`--output=${output}`];
  delete process.env.AIRTABLE_TOKEN;
  try{
    await assert.rejects(videoMasterMain(),/Airtable storyboard source drift/);
    const receipt=JSON.parse(readFileSync(join(output,"airtable-source-freshness.json"),"utf8"));
    assert.equal(receipt.pass,false);
    assert.equal(existsSync(join(output,"reference")),false);
    assert.equal(existsSync(join(output,"images")),false);
  }finally{
    process.argv=previousArgv;
    if(previousToken===undefined) delete process.env.AIRTABLE_TOKEN;
    else process.env.AIRTABLE_TOKEN=previousToken;
    rmSync(dir,{recursive:true,force:true});
  }
});

test("master resume verifies the immutable Airtable source after derived storyboard changes",async()=>{
  const live=fixture(V1);
  live.profile.fields["Timeline intra-scène V1"]=true;
  live.scenes=live.scenes.slice(0,8);
  live.content.fields["Scènes vidéo"]=live.scenes.map(scene=>scene.id);
  live.content.fields.Script=live.scenes.map(scene=>scene.fields.Narration).join(" ");
  const board=buildStoryboardContract(live.content,live.scenes,live.profile);
  const dir=mkdtempSync(join(tmpdir(),"hibou-source-resume-"));
  const input=join(dir,"input.json");
  const binding=join(dir,"binding.json");
  const snapshot=join(dir,"snapshot.json");
  const output=join(dir,"run");
  writeFileSync(input,JSON.stringify(board));
  writeFileSync(binding,"{}");
  writeFileSync(snapshot,JSON.stringify(sourceSnapshot(live)));
  const previousArgv=process.argv;
  const previousTimeline=process.env.HIBOU_VIDEO_TIMELINE_V1;
  process.argv=[process.execPath,resolve("scripts/video-master.mjs"),`--storyboard=${input}`,`--source-snapshot=${snapshot}`,`--binding=${binding}`,`--output=${output}`,"--preflight-only"];
  process.env.HIBOU_VIDEO_TIMELINE_V1="true";
  try{
    await videoMasterMain();
    const derivedPath=join(output,"storyboard.json");
    const derived=JSON.parse(readFileSync(derivedPath,"utf8"));
    derived.scenes[0].timeline={events:[{id:"derived",type:"camera",start_s:0,end_s:2,zoom_percent:3}]};
    writeFileSync(derivedPath,JSON.stringify(derived));
    await videoMasterMain();
    const receipt=JSON.parse(readFileSync(join(output,"airtable-source-freshness.json"),"utf8"));
    assert.equal(receipt.pass,true);
    assert.equal(receipt.immutable_source,true);
    assert.equal(receipt.verified_storyboard_path,join(output,"source-storyboard.json"));
    const immutable=JSON.parse(readFileSync(join(output,"source-storyboard.json"),"utf8"));
    assert.deepEqual(immutable,board);
    immutable.scenes[0].image_prompt="tampered source";
    writeFileSync(join(output,"source-storyboard.json"),JSON.stringify(immutable));
    await assert.rejects(videoMasterMain(),/immutable source storyboard missing or changed/);
    assert.equal(existsSync(join(output,"images")),false);
  }finally{
    process.argv=previousArgv;
    if(previousTimeline===undefined) delete process.env.HIBOU_VIDEO_TIMELINE_V1;
    else process.env.HIBOU_VIDEO_TIMELINE_V1=previousTimeline;
    rmSync(dir,{recursive:true,force:true});
  }
});
