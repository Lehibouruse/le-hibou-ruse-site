import assert from "node:assert/strict";
import test from "node:test";
import { attentionMetrics, chooseFrameTimes, intervalStats, parseSceneTimes, parseSilence, parseVolumeDetect, sceneMetrics, transcriptPace } from "../scripts/forensic-package-local.mjs";

test("scene parser extracts unique ffmpeg pts times",()=>{
  const s="[Parsed_showinfo] n:1 pts:100 pts_time:1.25\n[Parsed_showinfo] n:2 pts_time:1.30\n[Parsed_showinfo] n:3 pts_time:3.75";
  assert.deepEqual(parseSceneTimes(s),[1.25,3.75]);
});

test("scene metrics calculate intervals and median",()=>{
  const r=sceneMetrics(10,[2,5,9]);
  assert.equal(r.cut_count,3);
  assert.equal(r.scene_count,4);
  assert.deepEqual(r.intervals_s,[2,3,4,1]);
  assert.equal(r.median_scene_duration_s,2.5);
});

test("volume and silence parsers keep metrics distinct",()=>{
  assert.deepEqual(parseVolumeDetect("mean_volume: -20.5 dB\nmax_volume: -1.2 dB"),{mean_db:-20.5,max_db:-1.2});
  const s=parseSilence("silence_start: 0.5\nsilence_end: 1.2 | silence_duration: 0.7\nsilence_start: 4\nsilence_end: 4.5 | silence_duration: 0.5");
  assert.equal(s.length,2);
  assert.equal(s[0].duration,0.7);
});

test("frame selection is bounded and falls back to even sampling",()=>{
  const a=chooseFrameTimes(12,[1,3,5,7,9],{maxFrames:4});
  assert.equal(a.length,4);
  const b=chooseFrameTimes(6,[],{maxFrames:5});
  assert.ok(b.length>=3&&b.length<=5);
  assert.ok(b.every(x=>x>0&&x<6));
});

test("attention cadence is explicitly a sensitive scene-score proxy",()=>{
  const r=attentionMetrics(10,[1,3,7],{threshold:0.12});
  assert.equal(r.schema,"HIBOU_FORENSIC_ATTENTION_PROXY_V1");
  assert.equal(r.proxy_only,true);
  assert.equal(r.method,"ffmpeg_scene_score_sensitive_proxy");
  assert.equal(r.event_count,3);
  assert.equal(r.event_interval_s,2.5);
  assert.deepEqual(r.intervals_s,[1,2,4,3]);
});

test("interval stats remain deterministic and scene composition cadence matches median cut interval",()=>{
  const i=intervalStats(10,[2,5,9]);
  assert.equal(i.event_count,3);
  assert.equal(i.median_interval_s,2.5);
  const s=sceneMetrics(10,[2,5,9]);
  assert.equal(s.composition_change_interval_s,2.5);
});

test("transcript pace is derived only from a real local transcript payload",()=>{
  const transcript={
    status:"ok",
    text:"un deux trois quatre cinq six sept huit neuf dix onze douze",
    segments:[
      {start:0,end:2,text:"un deux trois quatre cinq six"},
      {start:3,end:5,text:"sept huit neuf dix onze douze"}
    ]
  };
  const r=transcriptPace(transcript,6);
  assert.equal(r.word_count,12);
  assert.equal(r.words_per_minute,120);
  assert.equal(r.speaking_time_s,4);
  assert.equal(r.words_per_minute_speaking_time,180);
});

test("missing transcript never fabricates pace metrics",()=>{
  const r=transcriptPace({status:"not_run"},10);
  assert.equal(r.word_count,null);
  assert.equal(r.words_per_minute,null);
  assert.equal(r.words_per_minute_speaking_time,null);
});
