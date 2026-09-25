#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function fail(message){ throw new Error(message); }
function clean(value){ return String(value ?? "").trim(); }
function round(value,n=4){ return Number.isFinite(value)?Number(value.toFixed(n)):null; }

export function normalizeWords(text){
  return clean(text)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g,"")
    .replace(/[’']/g," ")
    .replace(/[^a-z0-9]+/g," ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function editDistance(a,b){
  const x=Array.isArray(a)?a:normalizeWords(a);
  const y=Array.isArray(b)?b:normalizeWords(b);
  const prev=Array.from({length:y.length+1},(_,i)=>i);
  for(let i=1;i<=x.length;i++){
    const cur=[i];
    for(let j=1;j<=y.length;j++){
      const cost=x[i-1]===y[j-1]?0:1;
      cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+cost);
    }
    for(let j=0;j<cur.length;j++) prev[j]=cur[j];
  }
  return prev[y.length];
}

export function wordErrorRate(expected,actual){
  const e=normalizeWords(expected), a=normalizeWords(actual);
  if(!e.length) return a.length?1:0;
  return editDistance(e,a)/e.length;
}

function segmentTextForSpan(segments,start,end){
  return (segments||[])
    .filter(seg=>{
      const s=Number(seg?.start), e=Number(seg?.end);
      return Number.isFinite(s)&&Number.isFinite(e)&&Math.max(s,start)<Math.min(e,end);
    })
    .map(seg=>clean(seg.text))
    .filter(Boolean)
    .join(" ");
}

export function compareVoiceContract(contract,transcript,{maxOverallWer=0.12,maxSceneWer=0.30,minLanguageProbability=0.75}={}){
  if(contract?.contract_version!=="HIBOU_VIDEO_CONTRACT_V1") fail("HIBOU_VIDEO_CONTRACT_V1 required");
  if(!Array.isArray(contract?.scenes)||!contract.scenes.length) fail("contract scenes required");
  if(transcript?.schema!=="HIBOU_FORENSIC_TRANSCRIPT_V1"||transcript?.status!=="ok") fail("HIBOU_FORENSIC_TRANSCRIPT_V1 status=ok required");

  const expectedAll=[];
  const sceneResults=[];
  for(const scene of contract.scenes){
    const expected=clean(scene.narration_text || scene?.voice?.text || "");
    const ref=scene.narration_exact||{};
    const start=Number(ref.start_s), end=Number(ref.end_s);
    if(!expected||!Number.isFinite(start)||!Number.isFinite(end)||end<=start){
      sceneResults.push({
        scene_id:scene.scene_id||"",
        status:"not_comparable",
        expected_text:expected,
        actual_text:"",
        wer:null,
        similarity:null,
        reason:"missing expected text or audio span"
      });
      continue;
    }
    expectedAll.push(expected);
    const actual=segmentTextForSpan(transcript.segments,start,end);
    const wer=wordErrorRate(expected,actual);
    sceneResults.push({
      scene_id:scene.scene_id||"",
      status:wer<=maxSceneWer?"PASS":"REVIEW",
      expected_text:expected,
      actual_text:actual,
      wer:round(wer),
      similarity:round(Math.max(0,1-wer)),
      span_start_s:start,
      span_end_s:end,
    });
  }

  const expectedText=expectedAll.join(" ");
  const actualText=clean(transcript.text || (transcript.segments||[]).map(x=>x.text).join(" "));
  const overallWer=wordErrorRate(expectedText,actualText);
  const lang=clean(transcript.language).toLowerCase();
  const langProb=Number(transcript.language_probability);
  const languageOk=(!lang||lang==="fr") && (!Number.isFinite(langProb)||langProb>=minLanguageProbability);
  const comparableScenes=sceneResults.filter(x=>x.status!=="not_comparable");
  const sceneReviews=comparableScenes.filter(x=>x.status==="REVIEW");
  const status=overallWer<=maxOverallWer && languageOk && sceneReviews.length===0 ? "PASS" : "REVIEW";

  return {
    schema:"HIBOU_VIDEO_VOICE_QC_V1",
    generated_at:new Date().toISOString(),
    status,
    expected_text:expectedText,
    transcript_text:actualText,
    overall_wer:round(overallWer),
    overall_similarity:round(Math.max(0,1-overallWer)),
    thresholds:{
      max_overall_wer:maxOverallWer,
      max_scene_wer:maxSceneWer,
      min_language_probability:minLanguageProbability,
    },
    language:{
      detected:lang||null,
      probability:Number.isFinite(langProb)?round(langProb):null,
      pass:languageOk,
    },
    scenes:sceneResults,
    counts:{
      total:contract.scenes.length,
      comparable:comparableScenes.length,
      pass:comparableScenes.filter(x=>x.status==="PASS").length,
      review:sceneReviews.length,
      not_comparable:sceneResults.filter(x=>x.status==="not_comparable").length,
    },
    recommendations:[
      ...(overallWer>maxOverallWer?[{scope:"global",action:"régénérer ou vérifier la narration : WER global au-dessus du seuil"}]:[]),
      ...sceneReviews.map(x=>({scope:x.scene_id,action:"écouter et régénérer uniquement cette scène si l’écart est réel",wer:x.wer})),
      ...(!languageOk?[{scope:"global",action:"vérifier langue/modèle Whisper ou qualité audio"}]:[])
    ],
    policy:{
      local_transcript_expected:true,
      paid_fallback:false,
      publication_authorized:false,
      human_review_required:status!=="PASS",
    }
  };
}

if(import.meta.url===`file://${process.argv[1]}`){
  const [contractPath,transcriptPath,outPath,...rest]=process.argv.slice(2);
  if(!contractPath||!transcriptPath) fail("usage: video-voice-qc.mjs contract-audio-ready.json transcript.json [output.json] [--max-overall-wer=0.12 --max-scene-wer=0.30]");
  const opts={};
  for(const arg of rest){
    if(arg.startsWith("--max-overall-wer=")) opts.maxOverallWer=Number(arg.split("=")[1]);
    else if(arg.startsWith("--max-scene-wer=")) opts.maxSceneWer=Number(arg.split("=")[1]);
    else if(arg.startsWith("--min-language-probability=")) opts.minLanguageProbability=Number(arg.split("=")[1]);
  }
  const contract=JSON.parse(readFileSync(resolve(contractPath),"utf8"));
  const transcript=JSON.parse(readFileSync(resolve(transcriptPath),"utf8"));
  const report=compareVoiceContract(contract,transcript,opts);
  const body=JSON.stringify(report,null,2)+"\n";
  if(outPath) writeFileSync(resolve(outPath),body,{encoding:"utf8",mode:0o600});
  process.stdout.write(body);
}
