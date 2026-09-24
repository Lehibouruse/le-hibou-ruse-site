#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";

function fail(message){ throw new Error(message); }
function run(cmd,args){
  const r=spawnSync(cmd,args,{encoding:"utf8"});
  if(r.status!==0) fail(`${cmd} failed: ${r.stderr?.slice(-5000)||r.stdout}`);
  return r.stdout;
}
function sha256(path){ return createHash("sha256").update(readFileSync(path)).digest("hex"); }
function norm(v){ return String(v||"").replace(/\s+/g," ").trim(); }
function assTime(seconds){
  const cs=Math.round(Number(seconds)*100);
  const h=Math.floor(cs/360000);
  const m=Math.floor((cs%360000)/6000);
  const s=Math.floor((cs%6000)/100);
  const c=cs%100;
  return `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}.${String(c).padStart(2,"0")}`;
}
function assEscape(v){
  return String(v||"").replaceAll("\\","\\\\").replaceAll("{","\\{").replaceAll("}","\\}").replace(/\r?\n/g,"\\N");
}
function wrapAssText(value,maxChars=30){
  const words=String(value||"").trim().split(/\s+/).filter(Boolean);
  const lines=[]; let line="";
  for(const word of words){
    const next=line?line+" "+word:word;
    if(line && next.length>maxChars){ lines.push(line); line=word; }
    else line=next;
  }
  if(line) lines.push(line);
  return assEscape(lines.join("\n"));
}
export function validateStoryboardPreview(contract){
  if(contract.contract_version!=="HIBOU_VIDEO_CONTRACT_V1") fail("unsupported contract_version");
  if(contract.method_version!=="VIDEO_METHOD_V3") fail("preview requires VIDEO_METHOD_V3");
  if(!Array.isArray(contract.scenes)||contract.scenes.length<15||contract.scenes.length>25) fail("scene_count must be 15..25");
  let total=0;
  contract.scenes.forEach((scene,i)=>{
    if(Number(scene.order)!==i+1) fail("scene order must be contiguous");
    const d=Number(scene.planned_duration_s);
    if(!Number.isFinite(d)||d<1.5||d>2.5) fail(`invalid duration scene ${i+1}`);
    if(!norm(scene.narration)) fail(`missing narration scene ${i+1}`);
    total+=d;
  });
  const reconstructed=norm(contract.scenes.map(x=>x.narration).join(" "));
  if(reconstructed!==norm(contract.exact_narration)) fail("scene narration does not reconstruct exact_narration");
  if(Math.abs(total-Number(contract.planned_duration_s))>0.05) fail("planned_duration_s mismatch");
  return {total:Number(total.toFixed(3)),sceneCount:contract.scenes.length};
}
export function buildPreviewAss(contract){
  const {total}=validateStoryboardPreview(contract);
  const header=`[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding
Style: Banner,Arial,42,&H00F5F0E6,&H00F5F0E6,&H00162A3A,&H80162A3A,-1,0,0,0,100,100,0,0,1,2,0,8,60,60,70,1
Style: Scene,Arial,72,&H00F5F0E6,&H00F5F0E6,&H00162A3A,&H80162A3A,-1,0,0,0,100,100,0,0,1,3,0,5,90,90,250,1
Style: Meta,Arial,34,&H00D6C7A1,&H00D6C7A1,&H00162A3A,&H80162A3A,0,0,0,0,100,100,0,0,1,2,0,2,70,70,80,1

[Events]
Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text
`;
  const lines=[];
  lines.push(`Dialogue: 0,0:00:00.00,${assTime(total)},Banner,,0,0,0,,PREVIEW TECHNIQUE — NON PUBLIABLE`);
  let cursor=0;
  for(const scene of contract.scenes){
    const start=cursor,end=cursor+Number(scene.planned_duration_s);
    lines.push(`Dialogue: 0,${assTime(start)},${assTime(end)},Scene,,0,0,0,,{\\pos(540,900)}${wrapAssText(scene.narration,28)}`);
    lines.push(`Dialogue: 0,${assTime(start)},${assTime(end)},Meta,,0,0,0,,SCÈNE ${String(scene.order).padStart(2,"0")} / ${contract.scenes.length} · ${Number(scene.planned_duration_s).toFixed(1)} s · VIDEO_METHOD_V3`);
    cursor=end;
  }
  return header+lines.join("\n")+"\n";
}
function ffmpegFilterPath(path){
  return resolve(path).replaceAll("\\","/").replaceAll(":","\\:").replaceAll("'","\\'");
}
export function renderStoryboardPreview(contractPathArg,outputArg){
  const contractPath=resolve(contractPathArg);
  const output=resolve(outputArg);
  const contract=JSON.parse(readFileSync(contractPath,"utf8"));
  const {total,sceneCount}=validateStoryboardPreview(contract);
  mkdirSync(dirname(output),{recursive:true});
  const assPath=output+".ass";
  writeFileSync(assPath,buildPreviewAss(contract));
  run("ffmpeg",[
    "-y","-loglevel","error",
    "-f","lavfi","-i",`color=c=0x102633:s=1080x1920:r=30:d=${total}`,
    "-f","lavfi","-i",`anullsrc=channel_layout=stereo:sample_rate=48000:d=${total}`,
    "-vf",`ass='${ffmpegFilterPath(assPath)}'`,
    "-c:v","libx264","-preset","veryfast","-crf","22","-pix_fmt","yuv420p",
    "-c:a","aac","-b:a","128k","-ar","48000","-ac","2",
    "-t",String(total),"-movflags","+faststart",output
  ]);
  if(!existsSync(output)) fail("preview output missing");
  const probe=JSON.parse(run("ffprobe",["-v","error","-show_entries","format=duration,size:stream=codec_name,codec_type,width,height,r_frame_rate,sample_rate,channels","-of","json",output]));
  const video=probe.streams.find(x=>x.codec_type==="video");
  const audio=probe.streams.find(x=>x.codec_type==="audio");
  const manifest={
    schema:"HIBOU_STORYBOARD_PREVIEW_V1",
    preview_only:true,
    publication_authorized:false,
    content_id:contract.content_id,
    title:contract.title,
    method_version:contract.method_version,
    scene_count:sceneCount,
    planned_duration_s:total,
    measured_duration_s:Number(probe.format.duration),
    size_bytes:Number(probe.format.size),
    sha256:sha256(output),
    video:{codec:video?.codec_name,width:video?.width,height:video?.height,fps:video?.r_frame_rate},
    audio:{codec:audio?.codec_name,sample_rate:audio?.sample_rate,channels:audio?.channels,semantic:"silence_only"},
    generated_media:false,
    generated_voice:false,
    music:false
  };
  writeFileSync(output+".manifest.json",JSON.stringify(manifest,null,2));
  return manifest;
}
if(import.meta.url===`file://${process.argv[1]}`){
  const [contract,output]=process.argv.slice(2);
  if(!contract||!output) fail("usage: node scripts/video-storyboard-preview.mjs contract.json output.mp4");
  process.stdout.write(JSON.stringify(renderStoryboardPreview(contract,output))+"\n");
}
