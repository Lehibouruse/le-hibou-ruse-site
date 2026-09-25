#!/usr/bin/env node
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

function fail(message){ throw new Error(message); }
function run(command,args){
  const r=spawnSync(command,args,{stdio:"inherit",windowsHide:true,shell:false});
  if(r.status!==0) fail(command+" failed with status "+r.status);
}

const [contractArg,audioArg,outDirArg,...rest]=process.argv.slice(2);
if(!contractArg||!audioArg||!outDirArg) fail("usage: video-voice-qc-run.mjs contract-audio-ready.json mastered.wav output_dir [qc flags]");
const contract=resolve(contractArg), audio=resolve(audioArg), outDir=resolve(outDirArg);
if(!existsSync(contract)||!existsSync(audio)) fail("contract or audio missing");
const python=String(process.env.HIBOU_FORENSIC_PYTHON||process.env.HIBOU_PYTHON||"").trim();
if(!python) fail("HIBOU_FORENSIC_PYTHON or HIBOU_PYTHON required; no cloud fallback");
const transcript=resolve(outDir,"voice-transcript.json");
const report=resolve(outDir,"voice-qc.json");
run(python,[resolve("scripts/forensic-transcribe-local.py"),audio,transcript]);
run(process.execPath,[resolve("scripts/video-voice-qc.mjs"),contract,transcript,report,...rest]);
