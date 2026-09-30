#!/usr/bin/env node
export const VISUAL_EVENT_RATE_SCHEMA="HIBOU_VISUAL_EVENT_RATE_V1";

function cleanTimes(values,duration){
  const max=Number(duration);
  const sorted=(Array.isArray(values)?values:[])
    .map(Number)
    .filter(v=>Number.isFinite(v)&&v>=0&&(!Number.isFinite(max)||v<=max))
    .sort((a,b)=>a-b);
  const out=[];
  for(const value of sorted){
    if(!out.length||Math.abs(value-out.at(-1))>0.08) out.push(Number(value.toFixed(3)));
  }
  return out;
}
function median(values){
  if(!values.length) return null;
  const s=[...values].sort((a,b)=>a-b),m=Math.floor(s.length/2);
  return s.length%2?s[m]:(s[m-1]+s[m])/2;
}
function rate(count,duration){
  return duration>0?Number((count/duration*60).toFixed(3)):null;
}
function eventIntervals(times,duration){
  const bounds=[0,...times.filter(t=>t>0&&t<duration),duration].sort((a,b)=>a-b);
  return bounds.slice(1).map((x,i)=>x-bounds[i]).filter(x=>x>0.01);
}
function perThird(duration,hardCuts,subtleEvents,plannedBeats=[]){
  const size=duration/3;
  return [0,1,2].map(index=>{
    const start=index*size;
    const end=index===2?duration:(index+1)*size;
    const inside=(t)=>index===2?t>=start&&t<=end:t>=start&&t<end;
    const hard=hardCuts.filter(inside).length;
    const subtle=subtleEvents.filter(inside).length;
    const planned=plannedBeats.filter(inside).length;
    return {
      third:index+1,
      start_s:Number(start.toFixed(3)),
      end_s:Number(end.toFixed(3)),
      hard_cut_count:hard,
      subtle_event_count:subtle,
      visual_event_count:hard+subtle,
      planned_attention_beat_count:planned,
      hard_cuts_per_minute:rate(hard,size),
      subtle_events_per_minute:rate(subtle,size),
      visual_events_per_minute:rate(hard+subtle,size),
      planned_attention_beats_per_minute:rate(planned,size),
    };
  });
}

export function visualEventMetrics(duration,sensitiveEventTimes,hardCutTimes,{
  sensitiveThreshold=0.12,
  hardCutThreshold=0.30,
  hardCutToleranceS=0.16,
  plannedAttentionBeatTimes=[]
}={}){
  const d=Number(duration);
  if(!(d>0)) throw new Error("visual event metrics require positive duration");
  const hard=cleanTimes(hardCutTimes,d);
  const sensitive=cleanTimes(sensitiveEventTimes,d);
  const subtle=sensitive.filter(t=>!hard.some(h=>Math.abs(h-t)<=hardCutToleranceS));
  const combined=cleanTimes([...hard,...subtle],d);
  const intervals=eventIntervals(combined,d);
  const planned=cleanTimes(plannedAttentionBeatTimes,d);
  return {
    schema:VISUAL_EVENT_RATE_SCHEMA,
    method:"ffmpeg_scene_score_sensitive_proxy_minus_hard_cuts",
    proxy_only:true,
    sensitive_threshold:Number(sensitiveThreshold),
    hard_cut_threshold:Number(hardCutThreshold),
    hard_cut_tolerance_s:Number(hardCutToleranceS),
    hard_cut_count:hard.length,
    subtle_event_count:subtle.length,
    visual_event_count:combined.length,
    hard_cut_times_s:hard,
    subtle_event_times_s:subtle,
    visual_event_times_s:combined,
    hard_cuts_per_minute:rate(hard.length,d),
    subtle_events_per_minute:rate(subtle.length,d),
    visual_events_per_minute:rate(combined.length,d),
    median_visual_event_interval_s:intervals.length?Number(median(intervals).toFixed(3)):null,
    planned_attention_beat_count:planned.length,
    planned_attention_beats_per_minute:rate(planned.length,d),
    thirds:perThird(d,hard,subtle,planned),
    policy:{
      hard_cuts_and_subtle_events_are_distinct:true,
      sensitive_proxy_does_not_claim_optical_flow:true,
      planned_attention_beats_are_contract_events_not_inferred_pixels:true,
      publication_authorized:false
    }
  };
}

export function plannedAttentionBeatTimes(contract){
  const out=[];
  let offset=0;
  for(const scene of contract?.scenes||[]){
    const duration=Number(scene?.measured_duration_s||scene?.planned_duration_s||0);
    const events=Array.isArray(scene?.timeline?.events)?scene.timeline.events:[];
    for(const event of events){
      const start=Number(event?.start_s);
      if(Number.isFinite(start)&&start>=0&&(!duration||start<=duration)){
        out.push(Number((offset+start).toFixed(3)));
      }
    }
    if(duration>0) offset+=duration;
  }
  return out;
}
