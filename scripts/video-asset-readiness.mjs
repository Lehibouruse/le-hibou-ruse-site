#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { planSceneAssetReuse } from "./video-asset-graph.mjs";

export const ASSET_READINESS_SCHEMA = "HIBOU_ASSET_GRAPH_READINESS_V1";

function fail(message){ throw new Error(message); }
function text(value){ return String(value ?? "").trim(); }
function sha256File(path){
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
function absoluteAssetPath(assetPath,graphPath){
  const raw=text(assetPath);
  if(!raw) return "";
  return isAbsolute(raw)?raw:resolve(dirname(resolve(graphPath)),raw);
}

function inspectAsset(asset,graphPath){
  const path=absoluteAssetPath(asset?.path,graphPath);
  const reusable=asset?.reusable!==false && asset?.quality_status!=="rejected";
  const exists=Boolean(path)&&existsSync(path);
  let actualSha=null;
  let sizeBytes=null;
  let hashMatch=null;
  if(exists){
    const stat=statSync(path);
    if(stat.isFile()){
      sizeBytes=stat.size;
      actualSha=sha256File(path);
      hashMatch=asset?.sha256?actualSha===String(asset.sha256).toLowerCase():null;
    }
  }
  const blockers=[];
  const warnings=[];
  if(reusable && !exists) blockers.push("reusable_asset_missing");
  if(reusable && exists && !sizeBytes) blockers.push("reusable_asset_not_file");
  if(reusable && exists && !asset?.sha256) blockers.push("reusable_asset_sha256_missing");
  if(reusable && exists && asset?.sha256 && hashMatch!==true) blockers.push("reusable_asset_sha256_mismatch");
  if(reusable && String(asset?.quality_status||"")!=="validated"){
    blockers.push("reusable_asset_not_validated");
  }
  if(reusable && (!asset?.provenance?.license || asset.provenance.license==="unspecified")){
    warnings.push("reusable_asset_license_unspecified");
  }
  return {
    asset_id:text(asset?.asset_id)||null,
    kind:text(asset?.kind)||null,
    path:path||null,
    reusable,
    quality_status:text(asset?.quality_status)||null,
    declared_sha256:text(asset?.sha256)||null,
    actual_sha256:actualSha,
    sha256_match:hashMatch,
    size_bytes:sizeBytes,
    provenance:asset?.provenance||null,
    blockers,
    warnings,
  };
}

export function assessAssetGraphReadiness(contract,graph,{graphPath=""}={}){
  if(contract?.contract_version!=="HIBOU_VIDEO_CONTRACT_V1"){
    fail("HIBOU_VIDEO_CONTRACT_V1 required");
  }
  if(graph?.schema!=="HIBOU_ASSET_GRAPH_V1"){
    fail("HIBOU_ASSET_GRAPH_V1 required");
  }
  if(!graphPath) fail("graphPath required for path/hash validation");

  const assetChecks=(graph.assets||[]).map(asset=>inspectAsset(asset,graphPath));
  const reusableAssets=assetChecks.filter(asset=>asset.reusable);
  const blockers=[];
  const warnings=[];

  for(const asset of assetChecks){
    for(const code of asset.blockers){
      blockers.push({code,asset_id:asset.asset_id,path:asset.path});
    }
    for(const code of asset.warnings){
      warnings.push({code,asset_id:asset.asset_id,path:asset.path});
    }
  }

  if(!reusableAssets.length){
    blockers.push({code:"no_reusable_assets"});
  }

  const scenePlans=[];
  let requirementCount=0;
  let reuseCount=0;
  let generationCount=0;
  for(const scene of contract.scenes||[]){
    const requirements=Array.isArray(scene?.asset_requirements)
      ? scene.asset_requirements
      : [];
    requirementCount+=requirements.length;
    const plan=planSceneAssetReuse(scene,graph);
    const slots=plan.slots.map(slot=>({
      ...slot,
      path:slot.path?absoluteAssetPath(slot.path,graphPath):null,
    }));
    reuseCount+=slots.filter(slot=>slot.action==="reuse").length;
    generationCount+=slots.filter(slot=>slot.action==="generate").length;
    scenePlans.push({
      scene_id:scene.scene_id,
      visual_group:text(scene.visual_group)||null,
      slots,
      reusable_count:slots.filter(slot=>slot.action==="reuse").length,
      generation_count:slots.filter(slot=>slot.action==="generate").length,
    });
  }

  if(requirementCount===0){
    blockers.push({code:"contract_has_no_asset_requirements"});
  }
  if(requirementCount>0 && reuseCount===0){
    warnings.push({code:"asset_graph_matches_no_contract_slots"});
  }

  const blockingCodes=[...new Set(blockers.map(item=>item.code))].sort();
  const report={
    schema:ASSET_READINESS_SCHEMA,
    graph_path:resolve(graphPath),
    graph_asset_count:(graph.assets||[]).length,
    reusable_asset_count:reusableAssets.length,
    validated_reusable_asset_count:reusableAssets.filter(
      asset=>asset.quality_status==="validated" && asset.blockers.length===0
    ).length,
    contract_scene_count:Array.isArray(contract.scenes)?contract.scenes.length:0,
    asset_requirement_count:requirementCount,
    reusable_slot_count:reuseCount,
    generation_slot_count:generationCount,
    scene_plans:scenePlans,
    asset_checks:assetChecks,
    blockers,
    warnings,
    blocking_codes:blockingCodes,
    ready_for_activation:blockers.length===0,
    policy:{
      read_only:true,
      filesystem_mutation_performed:false,
      gpu_execution_performed:false,
      paid_fallback:false,
      reusable_assets_require_validated_status:true,
      reusable_assets_require_sha256:true,
      missing_slots_may_generate:true,
      rejected_assets_never_reused:true,
      publication_authorized:false,
    },
  };
  return report;
}

if(import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [contractPath,graphPath,outputPath]=process.argv.slice(2);
  if(!contractPath||!graphPath||!outputPath){
    fail("usage: node scripts/video-asset-readiness.mjs contract.json asset-graph.json report.json");
  }
  if(!existsSync(resolve(contractPath))) fail("contract missing");
  if(!existsSync(resolve(graphPath))) fail("asset graph missing");
  const contract=JSON.parse(readFileSync(resolve(contractPath),"utf8"));
  const graph=JSON.parse(readFileSync(resolve(graphPath),"utf8"));
  const report=assessAssetGraphReadiness(contract,graph,{graphPath:resolve(graphPath)});
  writeFileSync(resolve(outputPath),JSON.stringify(report,null,2)+"\n","utf8");
  process.stdout.write(JSON.stringify({
    ok:report.ready_for_activation,
    schema:report.schema,
    output:resolve(outputPath),
    reusable_slot_count:report.reusable_slot_count,
    generation_slot_count:report.generation_slot_count,
    blocking_codes:report.blocking_codes,
  })+"\n");
  if(!report.ready_for_activation) process.exitCode=2;
}
