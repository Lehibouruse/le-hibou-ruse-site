import assert from "node:assert/strict";
import test from "node:test";
import { buildAss } from "../scripts/video-subtitles.mjs";
import { spawnSync } from "node:child_process";

test("ASS subtitles follow audio-reference scene timing and vertical safe area",()=>{
 const c={contract_version:"HIBOU_VIDEO_CONTRACT_V1",scenes:[
  {scene_id:"s1",narration_text:"Bonjour Hibou",narration_exact:{mode:"audio_reference",start_s:0,end_s:1.2}},
  {scene_id:"s2",narration_text:"Deuxième phrase",narration_exact:{mode:"audio_reference",start_s:1.2,end_s:2.8}}
 ]};
 const ass=buildAss(c); assert.match(ass,/PlayResX: 1080/); assert.match(ass,/PlayResY: 1920/); assert.match(ass,/Dialogue: 0,0:00:00.00,0:00:01.20/); assert.match(ass,/Bonjour Hibou/);
});
test("optional Whisper QC wrapper is syntax-valid without installing Whisper",()=>{
 const r=spawnSync("python3",["-m","py_compile","scripts/video-whisper-qc.py"],{encoding:"utf8"}); assert.equal(r.status,0,r.stderr);
});
