#!/usr/bin/env node
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, resolve } from "node:path";

function fail(message) { throw new Error(message); }
function sha256(path) { return createHash("sha256").update(readFileSync(path)).digest("hex"); }
function safeId(value) {
  const text=String(value||"");
  if(!/^[A-Za-z0-9._-]+$/.test(text)) fail(`unsafe scene id: ${text}`);
  return text;
}

export function promoteStoryboard(contractPathArg, selectionsPathArg, outputPathArg) {
  const contractPath=resolve(contractPathArg);
  const selectionsPath=resolve(selectionsPathArg);
  const outputPath=resolve(outputPathArg);
  const sourceRoot=dirname(contractPath);
  const selectionRoot=dirname(selectionsPath);
  const targetRoot=dirname(outputPath);
  const contract=JSON.parse(readFileSync(contractPath,"utf8"));
  const selections=JSON.parse(readFileSync(selectionsPath,"utf8"));

  if(contract.contract_version!=="HIBOU_VIDEO_CONTRACT_V1") fail("unsupported contract version");
  if(contract.contract_state!=="storyboard") fail("input contract must still be storyboard");
  if(contract.audio?.state!=="ready" || !contract.audio?.reference || !contract.audio?.sha256) fail("audio-ready contract required");

  const audioSource=resolve(sourceRoot,contract.audio.reference);
  if(!existsSync(audioSource)) fail(`audio missing: ${audioSource}`);
  if(sha256(audioSource)!==contract.audio.sha256) fail("audio sha256 mismatch before promotion");

  mkdirSync(resolve(targetRoot,"assets","audio"),{recursive:true});
  mkdirSync(resolve(targetRoot,"assets","images"),{recursive:true});
  mkdirSync(resolve(targetRoot,"assets","subtitles"),{recursive:true});
  const audioTarget=resolve(targetRoot,"assets","audio",basename(audioSource));
  if(audioSource!==audioTarget) copyFileSync(audioSource,audioTarget);
  const audioRel=`assets/audio/${basename(audioTarget)}`;

  for(const scene of contract.scenes){
    const sceneId=safeId(scene.scene_id);
    const pick=selections[sceneId];
    if(!pick?.selected) fail(`missing selected image for ${sceneId}`);
    const source=isAbsolute(pick.selected)?pick.selected:resolve(selectionRoot,pick.selected);
    if(!existsSync(source)) fail(`selected image missing for ${sceneId}: ${source}`);
    const ext=extname(source)||".png";
    const target=resolve(targetRoot,"assets","images",`${sceneId}${ext}`);
    if(source!==target) copyFileSync(source,target);
    scene.image={
      ...(scene.image||{}),
      candidates:Array.isArray(pick.candidates)?pick.candidates:[],
      selected:`assets/images/${basename(target)}`,
      selection_reason:String(pick.selection_reason||"human/local QC selection"),
      selected_sha256:sha256(target),
    };
    if(scene.narration_exact?.mode!=="audio_reference") fail(`${sceneId}: audio_reference required before promotion`);
    if(scene.narration_exact.sha256!==contract.audio.sha256) fail(`${sceneId}: narration/audio hash mismatch`);
    scene.narration_exact.source_audio=audioRel;
  }

  contract.audio.reference=audioRel;

  if (contract.subtitles?.burn_in && contract.subtitles?.reference) {
    const subtitleSource=isAbsolute(contract.subtitles.reference)
      ? contract.subtitles.reference
      : resolve(sourceRoot,contract.subtitles.reference);
    if(!existsSync(subtitleSource)) fail(`subtitles missing: ${subtitleSource}`);
    if(contract.subtitles.sha256 && sha256(subtitleSource)!==contract.subtitles.sha256) fail("subtitle sha256 mismatch before promotion");
    const subtitleTarget=resolve(targetRoot,"assets","subtitles","captions.ass");
    if(subtitleSource!==subtitleTarget) copyFileSync(subtitleSource,subtitleTarget);
    contract.subtitles.reference="assets/subtitles/captions.ass";
    contract.subtitles.sha256=sha256(subtitleTarget);
  }
  contract.contract_state="render_ready";
  contract.qc={...(contract.qc||{}),status:"PENDING_RENDER"};
  contract.validation={...(contract.validation||{}),human_required:true,publication_authorized:false,status:"READY_FOR_RENDER_NOT_PUBLICATION"};
  writeFileSync(outputPath,JSON.stringify(contract,null,2));
  return {output:outputPath,scene_count:contract.scenes.length,audio_sha256:contract.audio.sha256,subtitles_burn_in:Boolean(contract.subtitles?.burn_in)};
}

if(import.meta.url===`file://${process.argv[1]}`){
  const [contract,selections,output]=process.argv.slice(2);
  if(!contract||!selections||!output) fail("usage: node scripts/video-storyboard-promote.mjs contract-audio-ready.json selections.json contract-render-ready.json");
  process.stdout.write(`${JSON.stringify(promoteStoryboard(contract,selections,output))}\n`);
}
