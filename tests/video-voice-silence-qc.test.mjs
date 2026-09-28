import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  DEFAULT_MAX_SILENCE_S,
  DEFAULT_NOISE_DB,
  VOICE_SILENCE_QC_SCHEMA,
  evaluateVoiceSilence,
  parseSilenceDetect,
} from "../scripts/video-voice-silence-qc.mjs";
import { VIDEO_STAGE_ORDER } from "../scripts/video-resume-plan.mjs";

test("silencedetect parser pairs intervals and closes a trailing silence with media duration",()=>{
  const parsed=parseSilenceDetect([
    "[silencedetect] silence_start: 4.2",
    "[silencedetect] silence_end: 5.35 | silence_duration: 1.15",
    "[silencedetect] silence_start: 9.5",
  ].join("\n"),{mediaDurationS:10.6});
  assert.deepEqual(parsed.intervals,[
    {start_s:4.2,end_s:5.35,duration_s:1.15},
    {start_s:9.5,end_s:10.6,duration_s:1.1},
  ]);
});

test("voice silence QC rejects the same long-silence class caught by final master QC",()=>{
  const report=evaluateVoiceSilence({
    intervals:[
      {start_s:41.767042,end_s:43.304208,duration_s:1.537166},
    ],
    maxSilenceS:DEFAULT_MAX_SILENCE_S,
    mediaDurationS:55.9,
  });
  assert.equal(VOICE_SILENCE_QC_SCHEMA,"HIBOU_VOICE_SILENCE_QC_V1");
  assert.equal(DEFAULT_MAX_SILENCE_S,0.8);
  assert.equal(DEFAULT_NOISE_DB,-45);
  assert.equal(report.status,"REJECT");
  assert.equal(report.rejected_interval_count,1);
  assert.equal(report.policy.matches_master_qc_long_silence_gate,true);
  assert.equal(report.policy.block_before_images,true);
  assert.equal(report.policy.automatic_audio_repair,false);
});

test("sub-threshold pauses are accepted",()=>{
  const report=evaluateVoiceSilence({
    intervals:[
      {start_s:1,end_s:1.3,duration_s:0.3},
      {start_s:3,end_s:3.65,duration_s:0.65},
    ],
    maxSilenceS:0.8,
    mediaDurationS:5,
  });
  assert.equal(report.status,"PASS");
  assert.equal(report.rejected_interval_count,0);
  assert.equal(report.longest_silence_s,0.65);
});

test("pipeline orders silence QC after mastering and before expensive visual stages",()=>{
  const master=readFileSync(
    new URL("../scripts/video-master.mjs",import.meta.url),
    "utf8",
  );
  const audio=master.indexOf('stage(state,"audio_master"');
  const silence=master.indexOf('stage(state,"voice_silence_qc"');
  const images=master.indexOf('stage(state,"images"');
  assert(audio>=0 && silence>audio && images>silence);
  assert.match(master,/video-voice-silence-qc\.mjs/);
  assert.match(master,/voice-silence-qc\.json/);
  assert.match(master,/voice silence QC rejected mastered voice before image generation/);
});

test("resume stage order makes silence QC independently rerunnable",()=>{
  const audio=VIDEO_STAGE_ORDER.indexOf("audio_master");
  const silence=VIDEO_STAGE_ORDER.indexOf("voice_silence_qc");
  const images=VIDEO_STAGE_ORDER.indexOf("images");
  assert(audio>=0 && silence===audio+1 && images>silence);
});
