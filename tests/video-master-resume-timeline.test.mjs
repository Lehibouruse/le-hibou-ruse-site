import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { assertResumeTimelineContinuity, masterPolicy } from "../scripts/video-master.mjs";

const files=[
  ["prosody","storyboard-prosody.json"],
  ["voice","voice/contract-audio-ready.json"],
  ["audio_attach","contract-mastered.json"],
  ["subtitles","contract-captioned.json"],
  ["style","contract-styled.json"],
  ["pose_registry","contract-posed.json"],
  ["asset_resolution","contract-assets-resolved.json"]
];
const put=(path,value)=>{mkdirSync(dirname(path),{recursive:true});writeFileSync(path,JSON.stringify(value,null,2)+"\n");};
const hash=path=>createHash("sha256").update(readFileSync(path)).digest("hex");
function fixture(t){
  const root=mkdtempSync(join(tmpdir(),"hibou-resume-timeline-"));
  t.after(()=>rmSync(root,{recursive:true,force:true}));
  const contract={scenes:[{scene_id:"S01",timeline:{events:[{id:"current",type:"text",text:"CURRENT",start_s:0,end_s:3}]}}]};
  const state={stages:{}};
  for(const [name,file] of files){put(join(root,file),contract);state.stages[name]={status:"PASS",attempt:1};}
  const voice=join(root,"voice","voice-master.wav");writeFileSync(voice,"verified voice bytes");
  return {root,contract,state,voice};
}

test("resume accepts matching completed timelines without rewriting contracts, voice or PASS stages",t=>{
  const f=fixture(t),before=files.map(([,file])=>hash(join(f.root,file))),voiceHash=hash(f.voice),state=structuredClone(f.state);
  assertResumeTimelineContinuity(f.contract,f.state,f.root);
  assert.deepEqual(files.map(([,file])=>hash(join(f.root,file))),before);
  assert.equal(hash(f.voice),voiceHash);assert.deepEqual(f.state,state);
});

test("resume refuses stale timelines at every completed derived stage while preserving voice",async t=>{
  for(const [name,file] of files) await t.test(name,t=>{
    const f=fixture(t);f.state.stages=Object.fromEntries([[name,{status:"PASS"}]]);
    const current=structuredClone(f.contract);current.scenes[0].timeline.events[0].text="NEW";
    const before=hash(join(f.root,file)),voiceHash=hash(f.voice),state=structuredClone(f.state);
    assert.throws(()=>assertResumeTimelineContinuity(current,f.state,f.root),new RegExp("resume_timeline_continuity: "+name+".*S01"));
    assert.equal(hash(join(f.root,file)),before);assert.equal(hash(f.voice),voiceHash);assert.deepEqual(f.state,state);
  });
});

test("resume refuses removed timelines and scene set drift but permits unfinished outputs",t=>{
  const f=fixture(t);
  const noTimeline=structuredClone(f.contract);delete noTimeline.scenes[0].timeline;
  assert.throws(()=>assertResumeTimelineContinuity(noTimeline,f.state,f.root),/resume_timeline_continuity/);
  assert.throws(()=>assertResumeTimelineContinuity({scenes:[]},f.state,f.root),/resume_timeline_continuity/);
  assert.doesNotThrow(()=>assertResumeTimelineContinuity(noTimeline,{stages:{prosody:{status:"RUNNING"},voice:{status:"ERROR"}}},f.root));
  rmSync(join(f.root,"storyboard-prosody.json"));
  assert.throws(()=>assertResumeTimelineContinuity(f.contract,f.state,f.root),/PASS contract missing/);
});

test("master stops before persisting a newly compiled montage and retains verified voice",t=>{
  const f=fixture(t),storyboard=join(f.root,"storyboard.json"),source=join(f.root,"source-storyboard.json"),binding=join(f.root,"binding.json"),statePath=join(f.root,"pipeline-run.json");
  const contract={contract_version:"HIBOU_VIDEO_CONTRACT_V1",contract_state:"storyboard",content:{content_id:"rec8lgQT8jXreflmt"},features:{video_timeline_v1:true},scenes:[{scene_id:"S01",order:3,planned_duration_s:6,visual_idea:"Cash sans vendre."}]};
  put(storyboard,contract);put(source,contract);put(binding,{});put(join(f.root,"voice/contract-audio-ready.json"),contract);
  const state={schema:"HIBOU_VIDEO_MASTER_RUN_V1",path:statePath,root:f.root,inputs:{source:{type:"file",path:storyboard,sha256:hash(storyboard)},source_snapshot:null,binding:{path:binding,sha256:hash(binding)},style:null,asset_graph:null,reuse_from:null,execution_override:{production_mode:null,candidates_per_scene:null},policy:masterPolicy()},stages:{storyboard:{status:"PASS"},voice:{status:"PASS"}},source_storyboard:{path:source,sha256:hash(source),immutable:true}};
  put(statePath,state);
  const storyboardHash=hash(storyboard),sourceHash=hash(source),voiceHash=hash(f.voice);
  const result=spawnSync(process.execPath,[fileURLToPath(new URL("../scripts/video-master.mjs",import.meta.url)),"--storyboard="+storyboard,"--binding="+binding,"--output="+f.root,"--preflight-only"],{encoding:"utf8",windowsHide:true,env:{...process.env,HIBOU_VIDEO_TIMELINE_V1:"true"}});
  assert.equal(result.status,1);assert.match(result.stderr,/resume_timeline_continuity: voice/);
  assert.equal(hash(storyboard),storyboardHash);assert.equal(hash(source),sourceHash);assert.equal(hash(f.voice),voiceHash);
  assert.deepEqual(JSON.parse(readFileSync(statePath,"utf8")).stages,state.stages);
});
