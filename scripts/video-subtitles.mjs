#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

function fail(m){throw new Error(m);}
function assTime(seconds){
  const cs=Math.max(0,Math.round(Number(seconds)*100));
  const h=Math.floor(cs/360000), m=Math.floor((cs%360000)/6000), s=Math.floor((cs%6000)/100), c=cs%100;
  return `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}.${String(c).padStart(2,"0")}`;
}
function esc(text){return String(text||"").replaceAll("\\","\\\\").replaceAll("{","\\{").replaceAll("}","\\}").replace(/\r?\n/g,"\\N");}
export function buildAss(contract,{font="DejaVu Sans",fontSize=54,marginV=150}={}){
  if(contract?.contract_version!=="HIBOU_VIDEO_CONTRACT_V1") fail("unsupported contract");
  const events=[];
  for(const scene of contract.scenes||[]){
    const ref=scene.narration_exact||{};
    if(ref.mode!=="audio_reference") fail(`${scene.scene_id}: audio_reference required for synced subtitles`);
    const start=Number(ref.start_s), end=Number(ref.end_s);
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start) fail(`${scene.scene_id}: invalid subtitle timing`);
    const text=scene.narration_text||scene.breath_unit||"";
    if(!String(text).trim()) fail(`${scene.scene_id}: subtitle text missing`);
    const shortText=String(scene.screen_text||"").trim();
    if(shortText) events.push(`Dialogue: 1,${assTime(start)},${assTime(end)},ScreenText,,0,0,0,,${esc(shortText)}`);
    events.push(`Dialogue: 0,${assTime(start)},${assTime(end)},Narration,,0,0,0,,${esc(text)}`);
  }
  return [
    "[Script Info]","ScriptType: v4.00+","PlayResX: 1080","PlayResY: 1920","WrapStyle: 2","ScaledBorderAndShadow: yes","",
    "[V4+ Styles]",
    "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding",
    `Style: Narration,${font},${fontSize},&H00FFFFFF,&H000000FF,&H00141414,&H70000000,-1,0,0,0,100,100,0,0,1,5,1,2,90,90,${marginV},1`,
    `Style: ScreenText,${font},48,&H00FFFFFF,&H000000FF,&H00141414,&H50000000,-1,0,0,0,100,100,0,0,1,4,1,8,100,100,190,1`,
    "",
    "[Events]","Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text",
    ...events,""
  ].join("\n");
}
if(import.meta.url===`file://${process.argv[1]}`){
  const [contractPath,outPath]=process.argv.slice(2);
  if(!contractPath||!outPath) fail("usage: video-subtitles.mjs contract-audio-ready.json subtitles.ass");
  const contract=JSON.parse(readFileSync(resolve(contractPath),"utf8"));
  const ass=buildAss(contract);
  mkdirSync(dirname(resolve(outPath)),{recursive:true}); writeFileSync(resolve(outPath),ass);
  process.stdout.write(JSON.stringify({ok:true,output:resolve(outPath),scene_count:contract.scenes.length})+"\n");
}
