#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const PROSODY_SCHEMA="HIBOU_PROSODY_PLAN_V1";
function fail(m){throw new Error(m);}
function sha256Text(v){return createHash("sha256").update(String(v),"utf8").digest("hex");}
function clamp(v,min,max){return Math.min(max,Math.max(min,Number(v)));}

export function splitVerbatim(text){
  const source=String(text??"");
  if(!source) return [];
  const units=[];
  const re=/[^.!?…]+[.!?…]+(?:\s+|$)|[^.!?…]+$/gu;
  let match;
  while((match=re.exec(source))){
    const span=match[0];
    const left=span.match(/^\s*/u)?.[0]?.length||0;
    const right=span.match(/\s*$/u)?.[0]?.length||0;
    const ttsEnd=span.length-right;
    const tts=span.slice(left,ttsEnd);
    if(!tts) continue;
    units.push({
      source_start:match.index,
      source_end:match.index+span.length,
      source_span:span,
      tts_text:tts,
      lexical_transform:false
    });
  }
  if(units.map(x=>x.source_span).join("")!==source) fail("verbatim segmentation changed source text");
  return units;
}

function normalizeCue(cue){
  return {
    phrase:String(cue?.phrase||""),
    pause_before_ms:Math.max(0,Math.round(Number(cue?.pause_before_ms||0))),
    pause_after_ms:Math.max(0,Math.round(Number(cue?.pause_after_ms||0))),
    relative_speed_pct:clamp(cue?.relative_speed_pct??100,85,115),
    emphasis:String(cue?.emphasis||"normal"),
    intent:String(cue?.intent||"neutral")
  };
}

function nativeFromCue(cue,base={}){
  const emphasis=String(cue.emphasis||"normal").toLowerCase();
  const intent=String(cue.intent||"neutral").toLowerCase();
  const energeticIntent=/attaque|iron|reveal|révél|punchline|ferme|fort|énerg|energ/.test(intent);
  const restrainedIntent=/calm|calme|posé|pose|lent|pédagog|pedagog/.test(intent);
  const exaggeration=base.exaggeration!=null?Number(base.exaggeration):
    emphasis==="strong"||emphasis==="appuye"||emphasis==="appuyé"?0.72:
    emphasis==="subtle"||emphasis==="leger"||emphasis==="léger"?0.42:
    energeticIntent?0.62:
    restrainedIntent?0.46:0.5;
  const cfgWeight=base.cfg_weight!=null?Number(base.cfg_weight):
    /alerte|reveal|révél|attaque|punchline|ferme/.test(intent)?0.58:0.5;
  const temperature=base.temperature!=null?Number(base.temperature):
    restrainedIntent?0.72:
    /rapide|accél|accel|attaque|énerg|energ/.test(intent)?0.86:0.8;
  return {
    exaggeration:clamp(exaggeration,0.25,2),
    temperature:clamp(temperature,0.05,5),
    cfg_weight:clamp(cfgWeight,0,1)
  };
}

function findCueForUnit(unit,cues){
  const exact=cues.find(c=>String(c?.phrase||"")&&unit.tts_text.includes(String(c.phrase)));
  return exact||null;
}

export function buildProsodyPlan(scene){
  const ref=scene?.narration_exact||{};
  if(ref.mode!=="text_reference") fail("prosody planning requires text_reference narration");
  const source=String(ref.text??"");
  if(!source) fail("narration text is empty");
  const voice=scene.voice||{};
  const verbatim=voice.verbatim!==false;
  if(!verbatim) fail("PROSODY_V1 currently requires verbatim narration");
  const rawCues=Array.isArray(voice.prosody_cues)?voice.prosody_cues:[];
  const scenePauseAfterMs=Math.max(0,Math.round(Number(voice.pause_after_ms||0)));
  const baseCue=normalizeCue({
    pause_before_ms:voice.pause_before_ms,
    pause_after_ms:0,
    relative_speed_pct:voice.relative_speed_pct,
    emphasis:voice.emphasis,
    intent:voice.intent
  });
  const baseNative=voice.native||{};
  const units=splitVerbatim(source).map((unit,index)=>{
    const specific=findCueForUnit(unit,rawCues);
    const cue=normalizeCue(specific?{...baseCue,...specific}:baseCue);
    return {
      id:`${scene.scene_id||"scene"}-U${String(index+1).padStart(2,"0")}`,
      ...unit,
      pause_before_ms:cue.pause_before_ms,
      pause_after_ms:cue.pause_after_ms,
      relative_speed_pct:cue.relative_speed_pct,
      emphasis:cue.emphasis,
      intent:cue.intent,
      chatterbox_native:nativeFromCue(cue,baseNative),
      ffmpeg_atempo:Number((cue.relative_speed_pct/100).toFixed(3))
    };
  });
  return {
    schema:PROSODY_SCHEMA,
    mode:"verbatim_segmented",
    source_text:source,
    source_sha256:sha256Text(source),
    lexical_transform:false,
    tts_punctuation_preserved:true,
    base_scene_cue:baseCue,
    scene_pause_after_ms:scenePauseAfterMs,
    specific_cue_count:rawCues.length,
    units
  };
}

export function applyProsodyPlan(contract){
  const out=JSON.parse(JSON.stringify(contract||{}));
  if(out.contract_version!=="HIBOU_VIDEO_CONTRACT_V1") fail("unsupported contract");
  out.features={...(out.features||{}),video_prosody_v1:true};
  out.scenes=(out.scenes||[]).map(scene=>{
    const copy={...scene,voice:{...(scene.voice||{})}};
    copy.voice.prosody_plan=buildProsodyPlan(copy);
    return copy;
  });
  return out;
}

if(import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [input,output]=process.argv.slice(2);
  if(!input||!output) fail("usage: video-prosody-plan.mjs input-storyboard.json output-storyboard.json");
  const out=applyProsodyPlan(JSON.parse(readFileSync(resolve(input),"utf8")));
  writeFileSync(resolve(output),JSON.stringify(out,null,2)+"\n","utf8");
  process.stdout.write(JSON.stringify({ok:true,schema:PROSODY_SCHEMA,output:resolve(output)})+"\n");
}
