#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const FACTUAL_GATE_SCHEMA="HIBOU_VIDEO_FACTUAL_GATE_V1";
const MODES=["declared_only","all_scenes"];

function fail(message){throw new Error(message);}
function text(value){return String(value??"").trim();}
function stable(value){
  if(Array.isArray(value)) return value.map(stable);
  if(!value||typeof value!=="object") return value;
  return Object.fromEntries(Object.keys(value).sort().map(k=>[k,stable(value[k])]));
}
function sha256(value){return createHash("sha256").update(JSON.stringify(stable(value)),"utf8").digest("hex");}
function validDate(value){return /^\d{4}-\d{2}-\d{2}$/.test(text(value));}
function declaredFactual(scene){
  return scene?.factual_required===true ||
    ["qualify","disqualify","condition","risk","source_label","jurisdiction","as_of_date"]
      .some(key=>text(scene?.[key]));
}

export function assessFactualGate(contract,{mode=null}={}){
  if(contract?.contract_version!=="HIBOU_VIDEO_CONTRACT_V1") fail("HIBOU_VIDEO_CONTRACT_V1 required");
  const configured=text(mode||contract?.factual_gate?.mode||"declared_only").toLowerCase();
  if(!MODES.includes(configured)) fail("factual gate mode must be declared_only or all_scenes");
  const scenes=Array.isArray(contract.scenes)?contract.scenes:[];
  if(!scenes.length) fail("at least one scene required");

  const checks=[];
  const blockers=[];
  const warnings=[];
  for(const scene of scenes){
    const sceneId=text(scene?.scene_id)||"unknown";
    const inScope=configured==="all_scenes"||declaredFactual(scene);
    if(!inScope){
      checks.push({scene_id:sceneId,in_scope:false,status:"NOT_IN_SCOPE",missing:[]});
      continue;
    }
    const missing=[];
    if(!text(scene?.source_label)) missing.push("source_label");
    if(!text(scene?.jurisdiction)) missing.push("jurisdiction");
    if(!text(scene?.as_of_date)) missing.push("as_of_date");
    else if(!validDate(scene.as_of_date)) missing.push("as_of_date_invalid");
    const status=missing.length?"REJECT":"PASS";
    checks.push({
      scene_id:sceneId,
      in_scope:true,
      status,
      source_label:text(scene?.source_label)||null,
      jurisdiction:text(scene?.jurisdiction)||null,
      as_of_date:text(scene?.as_of_date)||null,
      missing
    });
    for(const field of missing) blockers.push({code:"factual_metadata_missing_or_invalid",scene_id:sceneId,field});
  }

  const inScopeCount=checks.filter(x=>x.in_scope).length;
  if(configured==="declared_only"&&inScopeCount===0){
    warnings.push({code:"no_factual_scenes_declared"});
  }

  const core={
    schema:FACTUAL_GATE_SCHEMA,
    mode:configured,
    scene_count:scenes.length,
    in_scope_scene_count:inScopeCount,
    checks,
    blockers,
    warnings,
    status:blockers.length?"REJECT":"PASS",
    policy:{
      explicit_scope_only:true,
      narration_semantics_not_inferred:true,
      source_label_required:true,
      jurisdiction_required:true,
      as_of_date_required:true,
      no_source_truthfulness_claim:true,
      human_review_required:true,
      contract_mutation_performed:false,
      publication_authorized:false
    }
  };
  return {...core,factual_gate_sha256:sha256(core)};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [input,output]=process.argv.slice(2);
  if(!input||!output) fail("usage: node scripts/video-factual-gate.mjs contract.json report.json");
  const contract=JSON.parse(readFileSync(resolve(input),"utf8"));
  const report=assessFactualGate(contract);
  writeFileSync(resolve(output),JSON.stringify(report,null,2)+"\n","utf8");
  process.stdout.write(JSON.stringify({ok:report.status==="PASS",schema:report.schema,status:report.status,output:resolve(output),factual_gate_sha256:report.factual_gate_sha256})+"\n");
  if(report.status!=="PASS") process.exitCode=2;
}
