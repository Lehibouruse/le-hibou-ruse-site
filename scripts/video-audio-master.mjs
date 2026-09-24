#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

function fail(m){throw new Error(m);}
function run(args){
 const r=spawnSync("ffmpeg",args,{encoding:"utf8"});
 if(r.status!==0) fail(r.stderr?.slice(-5000)||"ffmpeg failed");
 return r.stderr;
}
function parseLoudnorm(stderr){
 const blocks=[...String(stderr).matchAll(/\{\s*"input_i"[\s\S]*?\}/g)];
 if(!blocks.length) fail("loudnorm JSON not found");
 return JSON.parse(blocks.at(-1)[0]);
}
function sha256(path){return createHash("sha256").update(readFileSync(path)).digest("hex");}
export function measure(input,{I=-16,TP=-1.5,LRA=7}={}){
 const err=run(["-hide_banner","-nostats","-i",resolve(input),"-af",`loudnorm=I=${I}:TP=${TP}:LRA=${LRA}:print_format=json`,"-f","null","-"]);
 return parseLoudnorm(err);
}
export function masterAudio(input,output,{I=-16,TP=-1.5,LRA=7}={}){
 const first=measure(input,{I,TP,LRA});
 mkdirSync(dirname(resolve(output)),{recursive:true});
 const filter=[
  `loudnorm=I=${I}:TP=${TP}:LRA=${LRA}`,
  `measured_I=${first.input_i}`,`measured_LRA=${first.input_lra}`,
  `measured_TP=${first.input_tp}`,`measured_thresh=${first.input_thresh}`,
  `offset=${first.target_offset}`,"linear=true","print_format=json"
 ].join(":");
 const err=run(["-y","-hide_banner","-nostats","-i",resolve(input),"-af",filter,"-ar","48000","-ac","2","-c:a","pcm_s24le",resolve(output)]);
 const second=parseLoudnorm(err);
 const result={schema:"HIBOU_AUDIO_MASTER_V1",source:resolve(input),output:resolve(output),sha256:sha256(resolve(output)),target:{I,TP,LRA},first_pass:first,second_pass:second,paid_fallback:false};
 writeFileSync(`${resolve(output)}.manifest.json`,JSON.stringify(result,null,2));
 return result;
}
if(import.meta.url===`file://${process.argv[1]}`){
 const [input,output,...rest]=process.argv.slice(2); if(!input||!output) fail("usage: video-audio-master.mjs input.wav output.wav [--I=-16 --TP=-1.5 --LRA=7]");
 const opts={}; for(const a of rest){if(a.startsWith("--I="))opts.I=Number(a.slice(4)); if(a.startsWith("--TP="))opts.TP=Number(a.slice(5)); if(a.startsWith("--LRA="))opts.LRA=Number(a.slice(6));}
 process.stdout.write(JSON.stringify(masterAudio(input,output,opts))+"\n");
}
