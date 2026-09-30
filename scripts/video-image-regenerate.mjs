#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { mkdirSync } from "node:fs";

function fail(m){throw new Error(m);}
function load(path){return JSON.parse(readFileSync(resolve(path),"utf8"));}

function shaText(value){
  return createHash("sha256").update(String(value??""),"utf8").digest("hex");
}

function mutateRequest(request,{oldSeed,newSeed,promptSuffix}){
  if(!request||typeof request!=="object") return;
  if(!request.overrides||typeof request.overrides!=="object"){
    fail("targeted regeneration requires workflow overrides");
  }

  const app=request.prompt_application;
  if(!["HIBOU_IMAGE_PROMPT_APPLICATION_V1","HIBOU_IMAGE_PROMPT_APPLICATION_V2"].includes(app?.schema)){
    fail("targeted regeneration requires prompt_application binding proof");
  }
  const promptNodeId=String(app.prompt_node_id||"");
  const promptInput=String(app.prompt_input||"");
  const promptNode=request.overrides?.[promptNodeId];
  const currentPrompt=promptNode?.[promptInput];
  if(typeof currentPrompt!=="string"||!currentPrompt.trim()){
    fail("targeted regeneration cannot locate the bound ComfyUI prompt input");
  }
  const oldPromptSha=shaText(currentPrompt);
  if(app.compiled_prompt_sha256&&oldPromptSha!==String(app.compiled_prompt_sha256)){
    fail("targeted regeneration source prompt hash mismatch");
  }
  const nextPrompt=(currentPrompt+" "+promptSuffix).trim();
  promptNode[promptInput]=nextPrompt;
  app.compiled_prompt_sha256=shaText(nextPrompt);
  app.regeneration={
    schema:"HIBOU_PROMPT_REGENERATION_APPLICATION_V1",
    base_compiled_prompt_sha256:oldPromptSha,
    suffix_sha256:shaText(promptSuffix),
    regenerated_compiled_prompt_sha256:app.compiled_prompt_sha256
  };

  if(request.seed!==undefined&&Number(request.seed)===Number(oldSeed)){
    request.seed=newSeed;
  }
  const seedApp=request.seed_application;
  if(seedApp?.schema!=="HIBOU_IMAGE_SEED_APPLICATION_V1"){
    fail("targeted regeneration requires explicit seed_application binding proof");
  }
  const seedNodeId=String(seedApp.seed_node_id||"");
  const seedInput=String(seedApp.seed_input||"");
  const seedNode=request.overrides?.[seedNodeId];
  if(!seedNode||!(seedInput in seedNode)){
    fail("targeted regeneration cannot locate the bound ComfyUI seed input");
  }
  if(Number(seedNode[seedInput])!==Number(oldSeed)){
    fail("targeted regeneration source seed mismatch");
  }
  seedNode[seedInput]=newSeed;
  seedApp.seed=newSeed;
}
export function buildTargetedRegeneration(plan,qc,{attempt=1}={}){
  if(plan?.schema!=="HIBOU_IMAGE_PLAN_V1") fail("unsupported image plan");
  if(plan?.prompt_contract_ref?.schema!=="HIBOU_PROMPT_CONTRACT_REF_V2"){
    fail("targeted regeneration requires prompt_contract_ref V2");
  }
  if(qc?.schema!=="HIBOU_IMAGE_PERCEPTUAL_QC_V1") fail("unsupported perceptual QC");
  if(!Number.isInteger(attempt)||attempt<1) fail("attempt must be a positive integer");
  const failed=new Set(Object.entries(qc.scene_summary||{}).filter(([,v])=>v?.needs_regeneration).map(([k])=>k));
  const requests=[];
  for(const item of plan.requests||[]){
    if(!failed.has(item.scene_id)) continue;
    const bump=100003*attempt;
    const sourceRef=item?.request?.prompt_contract_ref||item?.fallback_request?.prompt_contract_ref||null;
    if(sourceRef?.schema!=="HIBOU_PROMPT_CONTRACT_REF_V2"){
      fail(item.scene_id+": regeneration source is missing strict prompt contract ref");
    }
    if(sourceRef.contract_sha256!==plan.prompt_contract_ref.contract_sha256||
       sourceRef.global_sha256!==plan.prompt_contract_ref.global_sha256||
       sourceRef.scene_id!==item.scene_id){
      fail(item.scene_id+": regeneration prompt contract ref does not match source plan");
    }
    const sourceRefSnapshot=JSON.stringify(sourceRef);
    const clone=structuredClone(item);
    clone.seed=Number(item.seed)+bump;
    clone.candidate_id=`${item.scene_id}-R${attempt}-C${item.candidate}`;
    const summary=qc.scene_summary?.[item.scene_id]||{};
    const reasons=Object.keys(summary.reason_counts||{});
    const corrections=[];
    if(reasons.includes("bright_clipping")) corrections.push("utiliser un fond majoritairement bleu nuit ou gris très sombre, réduire fortement les surfaces ivoire/blanches et les hautes lumières, éviter toute grande zone claire ou surexposée");
    if(reasons.includes("dark_clipping")) corrections.push("augmenter modérément l'éclairage global et éviter les aplats noirs bouchés");
    if(reasons.includes("brightness_low")) corrections.push("éclaircir légèrement les tons moyens sans créer de zones brûlées");
    if(reasons.includes("brightness_high")) corrections.push("assombrir les tons moyens et réduire les hautes lumières");
    const correctionText=corrections.length?(" Correction QC obligatoire: "+corrections.join("; ")+"."):"";
    const promptSuffix="Variation locale "+attempt+": conserver le sujet, la palette et la composition; corriger uniquement les défauts QC; produire une alternative visuellement distincte mais cohérente."+correctionText;
    mutateRequest(clone.request,{oldSeed:item.seed,newSeed:clone.seed,promptSuffix});
    mutateRequest(clone.fallback_request,{oldSeed:item.seed,newSeed:clone.seed,promptSuffix});
    const clonedRef=clone?.request?.prompt_contract_ref||clone?.fallback_request?.prompt_contract_ref||null;
    if(JSON.stringify(clonedRef)!==sourceRefSnapshot){
      fail(item.scene_id+": regeneration mutated prompt contract ref");
    }
    clone.regeneration={
      attempt,
      source_candidate_id:item.candidate_id,
      reason:"scene_has_no_qc_pass",
      prompt_contract_inherited:true,
      prompt_contract_ref:structuredClone(sourceRef)
    };
    requests.push(clone);
  }
  return {
    schema:"HIBOU_IMAGE_PLAN_V1",
    content_id:plan.content_id,
    prompt_contract_ref:structuredClone(plan.prompt_contract_ref),
    source_plan:plan.source_plan||null,
    regeneration:{schema:"HIBOU_TARGETED_REGEN_V1",attempt,failed_scenes:[...failed],untouched_scene_count:new Set((plan.requests||[]).map(x=>x.scene_id)).size-failed.size},
    requests
  };
}
if(import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [planPath,qcPath,outPath,...rest]=process.argv.slice(2);
  if(!planPath||!qcPath||!outPath) fail("usage: video-image-regenerate.mjs image-plan.json perceptual-qc.json regen-plan.json [--attempt=N]");
  const flag=rest.find(x=>x.startsWith("--attempt="));
  const attempt=flag?Number(flag.split("=")[1]):1;
  const result=buildTargetedRegeneration(load(planPath),load(qcPath),{attempt});
  mkdirSync(dirname(resolve(outPath)),{recursive:true});
  writeFileSync(resolve(outPath),JSON.stringify(result,null,2));
  process.stdout.write(JSON.stringify({ok:true,failed_scenes:result.regeneration.failed_scenes,requests:result.requests.length})+"\n");
}
