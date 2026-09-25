import assert from "node:assert/strict";
import test from "node:test";
import { qualityProximity, scoreMetric } from "../scripts/video-quality-proximity.mjs";

const profile={
  schema:"HIBOU_VIDEO_STYLE_PROFILE_V1",
  source_count:20,
  competitor_count:5,
  overall:{
    duration_s:{p25:30,median:40,p75:50},
    cuts_per_minute:{p25:15,median:20,p75:25},
    scene_median_s:{p25:2,median:3,p75:4},
    silence_ratio:{p25:.08,median:.12,p75:.16},
    mean_volume_db:{p25:-20,median:-18,p75:-16},
    speech_wpm:{p25:135,median:150,p75:165}
  }
};
const manifest={
  media:{duration_s:42},
  scene:{cut_count:14,median_scene_duration_s:3.2},
  voice:{silence_ratio:.11,mean_db:-18.5},
  transcript:{words_per_minute:152}
};

test("metric score is maximal at reference median and bounded",()=>{
  assert.equal(scoreMetric(40,profile.overall.duration_s).score,100);
  assert.ok(scoreMetric(50,profile.overall.duration_s).score<100);
  assert.equal(scoreMetric(999,profile.overall.duration_s).score,0);
});

test("quality report exposes transparent subscores and coverage",()=>{
  const r=qualityProximity(profile,manifest);
  assert.equal(r.schema,"HIBOU_VIDEO_QUALITY_PROXIMITY_V1");
  assert.equal(r.coverage.measured_metrics,6);
  assert.equal(r.coverage.possible_metrics,8);
  assert.equal(r.policy.missing_metrics_are_not_penalized,true);
  assert.equal(r.subscores.motion_score.status,"not_measured");
  assert.equal(r.subscores.text_density.status,"not_measured");
  assert.ok(r.overall_score>70);
});

test("missing optional measures do not reduce the weighted score",()=>{
  const a=qualityProximity(profile,manifest);
  const b=qualityProximity({...profile,overall:{...profile.overall,motion_score:{p25:.2,median:.5,p75:.8}}},manifest);
  assert.equal(a.overall_score,b.overall_score);
});

test("out-of-band metrics generate actionable directions",()=>{
  const r=qualityProximity(profile,{...manifest,media:{duration_s:80},voice:{...manifest.voice,silence_ratio:.30}});
  assert.ok(r.recommendations.some(x=>x.metric==="duration_s"&&/raccourcir/.test(x.action)));
  assert.ok(r.recommendations.some(x=>x.metric==="silence_ratio"&&/réduire/.test(x.action)));
});
