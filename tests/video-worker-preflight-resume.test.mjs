import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { buildStoryboardContract } from "../scripts/video-airtable-sync.mjs";

const worker=readFileSync(new URL("../scripts/hibou-github-worker.mjs",import.meta.url),"utf8");
const definitions=worker.slice(worker.indexOf("function stableStoryboard("),worker.indexOf("function pipelineFailureDetail("));
const sha256=file=>createHash("sha256").update(readFileSync(file)).digest("hex");
const context=vm.createContext({createHash,existsSync,readFileSync,path,sha256});
vm.runInContext(definitions,context);
const preflightArgs=vm.runInContext("buildVideoContractPreflightArgs",context);
const verifiedSource=vm.runInContext("verifiedExistingStoryboardPath",context);
const put=(file,value)=>{mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,JSON.stringify(value,null,2)+"\n");};
const get=file=>JSON.parse(readFileSync(file,"utf8"));
const master=fileURLToPath(new URL("../scripts/video-master.mjs",import.meta.url));
const output=args=>args.find(value=>value.startsWith("--output=")).slice("--output=".length);

function fixture(t){
  const dir=mkdtempSync(path.join(tmpdir(),"hibou-preflight-resume-"));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const content={id:"rec00000000000001",fields:{Sujet:"Explication",Script:"La voix originale.","Version script":3,"Prompt / consignes":"Un décor financier stable.","Profil vidéo":["rec00000000000002"],"Scènes vidéo":["rec00000000000003"]}};
  const profile={id:"rec00000000000002",fields:{Profil:"HIBOU_VIRAL_V1",Version:"2.5-V4.3",Actif:true,Description:"Profil global canonique","Style lock":"2D premium","Negative prompt":"no humans","Character lock Hibou":"canonical owl",Voix:"VOICE_V4_ORIGINAL — French natural voice","Politique musique":"no unlicensed music","Durée min scène":2.8,"Durée max scène":5}};
  const scenes=Array.from({length:8},(_,index)=>({id:"rec"+String(index+3).padStart(14,"0"),fields:{Scène:"S"+String(index+1).padStart(2,"0"),Ordre:index+1,Narration:"La voix originale.","Idée visuelle":"Un décor financier stable.","Prompt image":"bank interior","Texte écran":"EXPLICATION","Durée secondes":4,"Zoom %":2}}));
  content.fields["Scènes vidéo"]=scenes.map(scene=>scene.id);
  content.fields.Script=scenes.map(scene=>scene.fields.Narration).join(" ");
  const board=buildStoryboardContract(content,scenes,profile);
  const storyboardPath=path.join(dir,"storyboard.json"),sourcePath=path.join(dir,"source-storyboard.json"),snapshotPath=path.join(dir,"airtable-source-snapshot.json"),bindingPath=path.join(dir,"binding.json");
  const snapshot={schema:"HIBOU_AIRTABLE_SOURCE_SNAPSHOT_V1",capture_method:"server_airtable_live",base_id:"appWyUX7TYPNrDbyP",captured_at:new Date(Date.now()-1000).toISOString(),content_id:content.id,profile_record_id:profile.id,content,profile,scenes};
  put(storyboardPath,board);put(sourcePath,board);put(snapshotPath,snapshot);put(bindingPath,{});
  const args=[master,"--storyboard="+storyboardPath,"--source-snapshot="+snapshotPath,"--binding="+bindingPath,"--output="+dir,"--production-mode=final","--candidates-per-scene=2"];
  const options={dir,storyboardPath,existingStoryboardPath:null,sourceSnapshotPath:snapshotPath};
  return {dir,board,storyboardPath,sourcePath,snapshotPath,snapshot,args,options};
}

function runPreflight(args){
  const result=spawnSync(process.execPath,[...args,"--preflight-only"],{encoding:"utf8",windowsHide:true});
  assert.equal(result.status,0,result.stderr||result.stdout);
  assert.equal(JSON.parse(result.stdout.trim().split("\n").at(-1)).mode,"preflight_only");
}

test("first contract preflight uses the clean storyboard and leaves main arguments unchanged",t=>{
  const f=fixture(t),before=[...f.args],beforeHash=sha256(f.storyboardPath);
  const args=preflightArgs(f.args,f.options);
  assert.equal(args.find(value=>value.startsWith("--storyboard=")),"--storyboard="+f.storyboardPath);
  assert.match(path.basename(output(args)),/^[a-f0-9]{64}$/);
  runPreflight(args);
  assert.deepEqual(f.args,before);assert.equal(sha256(f.storyboardPath),beforeHash);
  assert.equal(existsSync(path.join(f.dir,"voice")),false);assert.equal(existsSync(path.join(f.dir,"images")),false);
});

test("same fresh snapshot can move from initial storyboard to verified immutable source without stale-state collision",t=>{
  const f=fixture(t),legacyState=path.join(f.dir,"_preflight","pipeline-run.json");put(legacyState,{old_state:true});
  const first=preflightArgs(f.args,f.options);runPreflight(first);
  const derived=structuredClone(f.board);derived.scenes[0].timeline={events:[{id:"compiled",type:"text",text:"DERIVED",start_s:0,end_s:4}]};put(f.storyboardPath,derived);
  const statePath=path.join(f.dir,"pipeline-run.json");
  put(statePath,{schema:"HIBOU_VIDEO_MASTER_RUN_V1",stages:{storyboard:{status:"PASS"},voice:{status:"PASS"}},source_storyboard:{path:f.sourcePath,sha256:sha256(f.sourcePath),immutable:true}});
  put(path.join(f.dir,"airtable-source-freshness.json"),{schema:"HIBOU_AIRTABLE_SOURCE_FRESHNESS_V1",pass:true,immutable_source:true,verified_storyboard_path:f.sourcePath,verified_storyboard_sha256:sha256(f.sourcePath)});
  const source=verifiedSource(f.storyboardPath,statePath);assert.equal(source,f.sourcePath);
  const mainHash=sha256(f.storyboardPath),sourceHash=sha256(f.sourcePath),stateHash=sha256(statePath);
  const resumed=preflightArgs(f.args,{...f.options,existingStoryboardPath:source});
  assert.notEqual(output(first),output(resumed));runPreflight(resumed);runPreflight(resumed);
  assert.equal(get(path.join(output(resumed),"pipeline-run.json")).inputs.source.path,f.sourcePath);
  assert.equal(sha256(f.storyboardPath),mainHash);assert.equal(sha256(f.sourcePath),sourceHash);assert.equal(sha256(statePath),stateHash);
  assert.deepEqual(get(legacyState),{old_state:true});assert.equal(f.args[1],"--storyboard="+f.storyboardPath);
});

test("a second fresh snapshot export gets a new preflight root and verifies again before GPU",t=>{
  const f=fixture(t),options={...f.options,existingStoryboardPath:f.sourcePath};
  const first=preflightArgs(f.args,options);runPreflight(first);
  const firstReceipt=get(path.join(output(first),"airtable-source-freshness.json"));
  put(f.snapshotPath,{...f.snapshot,captured_at:new Date().toISOString()});
  const second=preflightArgs(f.args,options);assert.notEqual(output(first),output(second));runPreflight(second);
  const secondReceipt=get(path.join(output(second),"airtable-source-freshness.json"));
  assert.equal(firstReceipt.pass,true);assert.equal(secondReceipt.pass,true);
  assert.notEqual(firstReceipt.captured_at,secondReceipt.captured_at);
  assert.equal(existsSync(path.join(output(second),"voice")),false);assert.equal(existsSync(path.join(output(second),"images")),false);
});

test("legacy storyboard byte changes use another deterministic root while identical inputs reuse one",t=>{
  const f=fixture(t),first=preflightArgs(f.args,f.options);
  assert.equal(output(first),output(preflightArgs(f.args,f.options)));
  runPreflight(first);const originalHash=sha256(f.storyboardPath);
  writeFileSync(f.storyboardPath,readFileSync(f.storyboardPath,"utf8")+" ");
  assert.notEqual(sha256(f.storyboardPath),originalHash);
  const changed=preflightArgs(f.args,f.options);assert.notEqual(output(first),output(changed));runPreflight(changed);
  assert.equal(output(changed),output(preflightArgs(f.args,f.options)));
});

test("contract preflight cannot be built without its fresh source snapshot",t=>{
  const f=fixture(t);
  assert.throws(()=>preflightArgs(f.args,{...f.options,sourceSnapshotPath:null}),/requires a fresh Airtable source snapshot/);
  rmSync(f.snapshotPath);assert.throws(()=>preflightArgs(f.args,f.options),/ENOENT/);
});
