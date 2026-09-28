import assert from "node:assert/strict";
import test from "node:test";
import { plannedAttentionBeatTimes, visualEventMetrics, VISUAL_EVENT_RATE_SCHEMA } from "../scripts/video-visual-event-metrics.mjs";

test("visual event rate separates hard cuts from subtle events",()=>{
  const r=visualEventMetrics(60,[1,2,10,20.05,30,40],[10.02,30.03],{hardCutToleranceS:0.1});
  assert.equal(r.schema,VISUAL_EVENT_RATE_SCHEMA);
  assert.equal(r.hard_cut_count,2);
  assert.equal(r.subtle_event_count,4);
  assert.equal(r.visual_event_count,6);
  assert.equal(r.hard_cuts_per_minute,2);
  assert.equal(r.subtle_events_per_minute,4);
  assert.equal(r.visual_events_per_minute,6);
});

test("events close to hard cuts are not double-counted",()=>{
  const r=visualEventMetrics(30,[5,10.04,15],[10],{hardCutToleranceS:0.1});
  assert.deepEqual(r.subtle_event_times_s,[5,15]);
  assert.equal(r.visual_event_count,3);
});

test("planned attention beats are carried separately from pixel-derived events",()=>{
  const contract={scenes:[
    {planned_duration_s:4,timeline:{events:[{start_s:1},{start_s:3}]}},
    {planned_duration_s:6,timeline:{events:[{start_s:2}]}}
  ]};
  const planned=plannedAttentionBeatTimes(contract);
  assert.deepEqual(planned,[1,3,6]);
  const r=visualEventMetrics(10,[2,5],[5],{plannedAttentionBeatTimes:planned});
  assert.equal(r.planned_attention_beat_count,3);
  assert.equal(r.policy.planned_attention_beats_are_contract_events_not_inferred_pixels,true);
});

test("thirds expose density shape without forcing equal cadence",()=>{
  const r=visualEventMetrics(90,[2,5,12,35,65,70],[5,65],{plannedAttentionBeatTimes:[1,4,31,62,88]});
  assert.equal(r.thirds.length,3);
  assert(r.thirds[0].visual_event_count>r.thirds[1].visual_event_count);
  assert.equal(r.policy.publication_authorized,false);
});
