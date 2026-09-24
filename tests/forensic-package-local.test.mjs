import assert from "node:assert/strict";
import test from "node:test";
import { chooseFrameTimes, parseSceneTimes, parseSilence, parseVolumeDetect, sceneMetrics } from "../scripts/forensic-package-local.mjs";

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
