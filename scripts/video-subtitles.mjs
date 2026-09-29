#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

function fail(m){throw new Error(m);}
function assTime(seconds){
  const cs=Math.max(0,Math.round(Number(seconds)*100));
  const h=Math.floor(cs/360000), m=Math.floor((cs%360000)/6000), s=Math.floor((cs%6000)/100), c=cs%100;
  return `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}.${String(c).padStart(2,"0")}`;
}
function esc(text){return String(text||"").replaceAll("\\","\\\\").replaceAll("{","\\{").replaceAll("}","\\}").replace(/\r?\n/g,"\\N");}
export function splitSubtitleGroups(text,{maxWords=6,maxChars=28}={}){
  const words=String(text||"").trim().split(/\s+/u).filter(Boolean);
  if(!words.length) return [];
  const size=Math.max(2,Math.min(8,Math.round(Number(maxWords)||6)));
  const charLimit=Math.max(18,Math.min(34,Math.round(Number(maxChars)||28)));
  const groups=[];
  let current=[];
  for(const word of words){
    const candidate=[...current,word].join(" ");
    if(current.length && (current.length>=size || candidate.length>charLimit)){
      groups.push(current.join(" "));
      current=[word];
    }else{
      current.push(word);
    }
    const sentenceEnd=/[.!?…]$/u.test(word);
    if(sentenceEnd&&current.length){
      groups.push(current.join(" "));
      current=[];
    }
  }
  if(current.length) groups.push(current.join(" "));
  return groups;
}
export function subtitleExecutionPolicy(contract){
  const lock=String(contract?.creative?.style_lock||"");
  const globalRuleDetected=/SOUS-TITRES/i.test(lock)&&/courts groupes de mots/i.test(lock)&&/blancs gras/i.test(lock)&&/contour sombre/i.test(lock);
  if(!globalRuleDetected) fail("GLOBAL subtitle rule missing from style_lock");
  return {
    schema:"HIBOU_SUBTITLE_EXECUTION_POLICY_V2",
    global_rule_detected:true,
    short_groups:true,
    max_words_per_group:6,
    max_chars_per_group:28,
    font_weight:"bold",
    primary_color:"white",
    dark_outline:true,
    narration_margin_left:110,
    narration_margin_right:110,
    narration_margin_bottom:190,
    screen_text_margin_left:110,
    screen_text_margin_right:110,
    screen_text_margin_top:210,
    mobile_first:true,
    publication_authorized:false
  };
}
export function subtitleRoutingAudit(contract){
  const rows=(contract.scenes||[]).map(scene=>{
    const screenText=String(scene?.screen_text||"").trim();
    const timelineRouted=Boolean(screenText)&&Array.isArray(scene?.timeline?.events)&&scene.timeline.events.some(
      event=>["text","callout"].includes(String(event?.type||"").toLowerCase())&&String(event?.text||"").trim()
    );
    const assRouted=Boolean(screenText)&&!timelineRouted;
    return {
      scene_id:String(scene?.scene_id||""),
      screen_text_present:Boolean(screenText),
      route:!screenText?"NONE":timelineRouted?"TIMELINE":"ASS_SCREEN_TEXT",
      routed:!screenText||timelineRouted||assRouted
    };
  });
  return {
    scene_count:rows.length,
    screen_text_scene_count:rows.filter(x=>x.screen_text_present).length,
    timeline_routed_count:rows.filter(x=>x.route==="TIMELINE").length,
    ass_routed_count:rows.filter(x=>x.route==="ASS_SCREEN_TEXT").length,
    all_screen_text_routed:rows.every(x=>x.routed),
    rows
  };
}
export function defaultSubtitleFont(platform=process.platform){ return platform==="win32"?"Arial":"DejaVu Sans"; }
export function buildAss(contract,{font=defaultSubtitleFont(),fontSize=54,marginV=null}={}){
  if(contract?.contract_version!=="HIBOU_VIDEO_CONTRACT_V1") fail("unsupported contract");
  const policy=subtitleExecutionPolicy(contract);
  const narrationMarginV=marginV==null?policy.narration_margin_bottom:Number(marginV);
  const events=[];
  for(const scene of contract.scenes||[]){
    const ref=scene.narration_exact||{};
    if(ref.mode!=="audio_reference") fail(`${scene.scene_id}: audio_reference required for synced subtitles`);
    const start=Number(ref.start_s), end=Number(ref.end_s);
    if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start) fail(`${scene.scene_id}: invalid subtitle timing`);
    const text=scene.narration_text||scene.breath_unit||"";
    if(!String(text).trim()) fail(`${scene.scene_id}: subtitle text missing`);
    const shortText=String(scene.screen_text||"").trim();
    const timelineHasText=Array.isArray(scene?.timeline?.events) && scene.timeline.events.some(event=>["text","callout"].includes(String(event?.type||"").toLowerCase()));
    if(shortText&&!timelineHasText){
      const beats=shortText.split("/").map(x=>x.trim()).filter(Boolean);
      const beatCount=Math.max(1,beats.length);
      beats.forEach((beat,index)=>{
        const beatStart=start+((end-start)*index/beatCount);
        const beatEnd=start+((end-start)*(index+1)/beatCount);
        events.push(`Dialogue: 1,${assTime(beatStart)},${assTime(beatEnd)},ScreenText,,0,0,0,,${esc(beat)}`);
      });
    }
    const narrationGroups=splitSubtitleGroups(text,{
      maxWords:policy.max_words_per_group,
      maxChars:policy.max_chars_per_group
    });
    const weights=narrationGroups.map(group=>Math.max(1,group.split(/\s+/u).filter(Boolean).length));
    const totalWeight=weights.reduce((sum,value)=>sum+value,0)||1;
    let cursor=start;
    narrationGroups.forEach((group,index)=>{
      const groupEnd=index===narrationGroups.length-1
        ? end
        : cursor+((end-start)*weights[index]/totalWeight);
      events.push(`Dialogue: 0,${assTime(cursor)},${assTime(groupEnd)},Narration,,0,0,0,,${esc(group)}`);
      cursor=groupEnd;
    });
  }
  return [
    "[Script Info]","ScriptType: v4.00+","PlayResX: 1080","PlayResY: 1920","WrapStyle: 2","ScaledBorderAndShadow: yes","",
    "[V4+ Styles]",
    "Format: Name,Fontname,Fontsize,PrimaryColour,SecondaryColour,OutlineColour,BackColour,Bold,Italic,Underline,StrikeOut,ScaleX,ScaleY,Spacing,Angle,BorderStyle,Outline,Shadow,Alignment,MarginL,MarginR,MarginV,Encoding",
    `Style: Narration,${font},${fontSize},&H00FFFFFF,&H000000FF,&H00141414,&H70000000,-1,0,0,0,100,100,0,0,1,5,1,2,${policy.narration_margin_left},${policy.narration_margin_right},${narrationMarginV},1`,
    `Style: ScreenText,${font},48,&H00FFFFFF,&H000000FF,&H00141414,&H50000000,-1,0,0,0,100,100,0,0,1,4,1,8,${policy.screen_text_margin_left},${policy.screen_text_margin_right},${policy.screen_text_margin_top},1`,
    "",
    "[Events]","Format: Layer,Start,End,Style,Name,MarginL,MarginR,MarginV,Effect,Text",
    ...events,""
  ].join("\n");
}
if(import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [contractPath,outPath]=process.argv.slice(2);
  if(!contractPath||!outPath) fail("usage: video-subtitles.mjs contract-audio-ready.json subtitles.ass");
  const contract=JSON.parse(readFileSync(resolve(contractPath),"utf8"));
  const policy=subtitleExecutionPolicy(contract);
  const routing=subtitleRoutingAudit(contract);
  if(!routing.all_screen_text_routed) fail("one or more SPECIFIC screen_text values are not routed");
  const ass=buildAss(contract);
  mkdirSync(dirname(resolve(outPath)),{recursive:true}); writeFileSync(resolve(outPath),ass);
  const manifest={
    schema:"HIBOU_SUBTITLE_EXECUTION_RECEIPT_V2",
    output:resolve(outPath),
    prompt_contract_ref:contract?.prompt_contract_v2?{
      schema:"HIBOU_PROMPT_CONTRACT_REF_V2",
      contract_sha256:contract.prompt_contract_v2.contract_sha256,
      global_sha256:contract.prompt_contract_v2.global_sha256,
      scene_count:Array.isArray(contract.prompt_contract_v2.scenes)?contract.prompt_contract_v2.scenes.length:0
    }:null,
    policy,
    routing,
    scene_count:(contract.scenes||[]).length,
    source_text_exact:true,
    screen_text_routed:routing.all_screen_text_routed,
    publication_authorized:false
  };
  writeFileSync(resolve(outPath)+".manifest.json",JSON.stringify(manifest,null,2)+"\n","utf8");
  process.stdout.write(JSON.stringify({ok:true,output:resolve(outPath),manifest:resolve(outPath)+".manifest.json",scene_count:contract.scenes.length,font_family:defaultSubtitleFont()})+"\n");
}
