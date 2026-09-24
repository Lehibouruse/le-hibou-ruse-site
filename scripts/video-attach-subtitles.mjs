#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
function fail(m){throw new Error(m);}
function sha256(p){return createHash("sha256").update(readFileSync(p)).digest("hex");}
export function attachSubtitles(contractPath,assPath,outPath){
 const c=JSON.parse(readFileSync(resolve(contractPath),"utf8"));
 if(c.contract_state!=="storyboard") fail("attach subtitles before promotion while contract is storyboard");
 const outRoot=dirname(resolve(outPath)); const abs=resolve(assPath);
 let ref=relative(outRoot,abs).replaceAll("\\","/"); if(!ref||ref.startsWith("..")) ref=abs;
 c.subtitles={status:"ready",format:"ass",reference:ref,sha256:sha256(abs),source:"audio_reference scene spans",burn_in:true};
 writeFileSync(resolve(outPath),JSON.stringify(c,null,2)); return {output:resolve(outPath),reference:ref};
}
if(import.meta.url===`file://${process.argv[1]}`){
 const [c,s,o]=process.argv.slice(2); if(!c||!s||!o) fail("usage: video-attach-subtitles.mjs contract.json subtitles.ass output.json");
 process.stdout.write(JSON.stringify(attachSubtitles(c,s,o))+"\n");
}
