#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { spawnSync } from "node:child_process";

function fail(m){throw new Error(m);}
function sha256(path){return createHash("sha256").update(readFileSync(path)).digest("hex");}
function duration(path){
 const r=spawnSync("ffprobe",["-v","error","-show_entries","format=duration","-of","default=nw=1:nk=1",path],{encoding:"utf8"});
 if(r.status!==0) fail(r.stderr); return Number(r.stdout.trim());
}
export function attachMasteredAudio(contractPath,audioPath,outPath,{tolerance=0.05}={}){
 const contract=JSON.parse(readFileSync(resolve(contractPath),"utf8"));
 if(contract?.audio?.state!=="ready"||!contract.audio.reference) fail("audio-ready contract required");
 const root=dirname(resolve(contractPath));
 const oldAudio=resolve(root,contract.audio.reference), nextAudio=resolve(audioPath);
 if(!existsSync(oldAudio)||!existsSync(nextAudio)) fail("audio file missing");
 const oldD=duration(oldAudio), newD=duration(nextAudio);
 if(Math.abs(oldD-newD)>tolerance) fail(`mastered audio duration drift ${Math.abs(oldD-newD).toFixed(3)}s > ${tolerance}s`);
 const h=sha256(nextAudio);
 const outRoot=dirname(resolve(outPath));
 let ref=relative(outRoot,nextAudio).replaceAll("\\","/");
 if(!ref||ref.startsWith("..")) ref=nextAudio;
 contract.audio={...contract.audio,reference:ref,sha256:h,mastered:true,source_reference:contract.audio.reference,source_duration_s:oldD,duration_s:newD};
 for(const scene of contract.scenes||[]){
   if(scene.narration_exact?.mode!=="audio_reference") fail(`${scene.scene_id}: audio_reference required`);
   scene.narration_exact.source_audio=ref; scene.narration_exact.sha256=h;
 }
 contract.qc ||= {}; contract.qc.audio_master={status:"APPLIED_DURATION_STABLE",source_duration_s:oldD,duration_s:newD,sha256:h};
 writeFileSync(resolve(outPath),JSON.stringify(contract,null,2));
 return {output:resolve(outPath),sha256:h,duration_s:newD};
}
if(import.meta.url===`file://${process.argv[1]}`){
 const [c,a,o]=process.argv.slice(2); if(!c||!a||!o) fail("usage: video-attach-mastered-audio.mjs contract-audio-ready.json mastered.wav contract-mastered.json");
 process.stdout.write(JSON.stringify(attachMasteredAudio(c,a,o))+"\n");
}
