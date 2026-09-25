#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";

function fail(m){throw new Error(m);}
function load(path){return JSON.parse(readFileSync(resolve(path),"utf8"));}
export function buildTargetedRegeneration(plan,qc,{attempt=1}={}){
  if(plan?.schema!=="HIBOU_IMAGE_PLAN_V1") fail("unsupported image plan");
  if(qc?.schema!=="HIBOU_IMAGE_PERCEPTUAL_QC_V1") fail("unsupported perceptual QC");
  if(!Number.isInteger(attempt)||attempt<1) fail("attempt must be a positive integer");
  const failed=new Set(Object.entries(qc.scene_summary||{}).filter(([,v])=>v?.needs_regeneration).map(([k])=>k));
  const requests=[];
  for(const item of plan.requests||[]){
    if(!failed.has(item.scene_id)) continue;
    const bump=100003*attempt;
    const clone=structuredClone(item);
    clone.seed=Number(item.seed)+bump;
    clone.candidate_id=`${item.scene_id}-R${attempt}-C${item.candidate}`;
    if(clone.request?.prompt){
      clone.request.prompt=`${clone.request.prompt}\nVariation de régénération locale n°${attempt}; conserver le sujet, la palette et la composition utiles, corriger uniquement les défauts QC.`;
    }
    if(clone.request?.seed!==undefined) clone.request.seed=clone.seed;
    if(clone.fallback_request?.seed!==undefined) clone.fallback_request.seed=clone.seed;
    clone.regeneration={attempt,source_candidate_id:item.candidate_id,reason:"scene_has_no_qc_pass"};
    requests.push(clone);
  }
  return {
    schema:"HIBOU_IMAGE_PLAN_V1",
    content_id:plan.content_id,
    source_plan:plan.source_plan||null,
    regeneration:{schema:"HIBOU_TARGETED_REGEN_V1",attempt,failed_scenes:[...failed],untouched_scene_count:new Set((plan.requests||[]).map(x=>x.scene_id)).size-failed.size},
    requests
  };
}
if(import.meta.url===`file://${process.argv[1]}`){
  const [planPath,qcPath,outPath,...rest]=process.argv.slice(2);
  if(!planPath||!qcPath||!outPath) fail("usage: video-image-regenerate.mjs image-plan.json perceptual-qc.json regen-plan.json [--attempt=N]");
  const flag=rest.find(x=>x.startsWith("--attempt="));
  const attempt=flag?Number(flag.split("=")[1]):1;
  const result=buildTargetedRegeneration(load(planPath),load(qcPath),{attempt});
  mkdirSync(dirname(resolve(outPath)),{recursive:true});
  writeFileSync(resolve(outPath),JSON.stringify(result,null,2));
  process.stdout.write(JSON.stringify({ok:true,failed_scenes:result.regeneration.failed_scenes,requests:result.requests.length})+"\n");
}
