#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { planSceneAssetReuse } from "./video-asset-graph.mjs";

function fail(message){ throw new Error(message); }
function text(v){ return String(v??"").trim(); }
function load(path){ return JSON.parse(readFileSync(resolve(path),"utf8")); }
function clone(v){ return structuredClone(v); }

function absoluteAssetPath(assetPath,graphPath){
  const raw=text(assetPath);
  if(!raw) return "";
  return isAbsolute(raw)?raw:resolve(dirname(resolve(graphPath)),raw);
}

function layerFrom(slot,existing={}){
  return { ...existing, path:slot.path };
}

export function applyAssetResolution(contract,graph,{graphPath=""}={}){
  if(contract?.contract_version!=="HIBOU_VIDEO_CONTRACT_V1") fail("unsupported contract version");
  if(graph?.schema!=="HIBOU_ASSET_GRAPH_V1") fail("unsupported asset graph");
  const out=clone(contract);
  const scenePlans=[];
  const generationSlots=[];

  for(const scene of out.scenes||[]){
    const plan=planSceneAssetReuse(scene,graph);
    const normalizedSlots=plan.slots.map(slot=>({
      ...slot,
      path:slot.path?absoluteAssetPath(slot.path,graphPath):null
    }));
    const allReusable=normalizedSlots.length>0 && normalizedSlots.every(x=>x.action==="reuse");
    const background=normalizedSlots.find(x=>x.slot==="background"&&x.action==="reuse");
    const status=allReusable&&background?"FULL_REUSE":normalizedSlots.length?"PARTIAL_OR_GENERATE":"NO_REQUIREMENTS";

    scene.asset_resolution={
      schema:"HIBOU_SCENE_ASSET_RESOLUTION_V1",
      status,
      slots:normalizedSlots,
      reusable_count:normalizedSlots.filter(x=>x.action==="reuse").length,
      generation_count:normalizedSlots.filter(x=>x.action==="generate").length,
      graph_asset_count:(graph.assets||[]).length
    };

    if(status==="FULL_REUSE"){
      const composition={...(scene.composition||{})};
      composition.background=background.path;
      const character=normalizedSlots.find(x=>x.slot==="character_pose"&&x.action==="reuse");
      if(character) composition.character_pose=layerFrom(character,composition.character_pose||{});
      const caption=normalizedSlots.find(x=>x.slot==="caption_layer"&&x.action==="reuse");
      if(caption) composition.caption_layer=layerFrom(caption,composition.caption_layer||{});
      const numeric=normalizedSlots.find(x=>x.slot==="numeric_overlay"&&x.action==="reuse");
      if(numeric) composition.numeric_overlay=layerFrom(numeric,composition.numeric_overlay||{});
      const objectSlots=normalizedSlots.filter(x=>x.action==="reuse"&&(x.slot==="object"||x.slot.startsWith("object_")));
      composition.object_layers=objectSlots.map((slot,index)=>layerFrom(slot,(composition.object_layers||[])[index]||{}));
      scene.composition=composition;
    }else{
      for(const slot of normalizedSlots.filter(x=>x.action==="generate")){
        generationSlots.push({
          scene_id:scene.scene_id,
          slot:slot.slot,
          kind:slot.kind,
          required_tags:slot.required_tags,
          optional_tags:slot.optional_tags
        });
      }
    }
    scenePlans.push({scene_id:scene.scene_id,status,slots:normalizedSlots});
  }

  out.asset_resolution={
    schema:"HIBOU_ASSET_RESOLUTION_RUN_V1",
    graph_schema:graph.schema,
    graph_asset_count:(graph.assets||[]).length,
    scene_count:scenePlans.length,
    full_reuse_scenes:scenePlans.filter(x=>x.status==="FULL_REUSE").map(x=>x.scene_id),
    generation_required_scenes:scenePlans.filter(x=>x.status==="PARTIAL_OR_GENERATE").map(x=>x.scene_id),
    generation_slots:generationSlots,
    policy:{
      full_reuse_skips_scene_generation:true,
      partial_reuse_does_not_override_full_scene_fallback:true,
      missing_slots_are_explicit:true,
      paid_fallback:false
    }
  };
  return out;
}

if(import.meta.url===`file://${process.argv[1]}`){
  const [contractPath,graphPath,outPath]=process.argv.slice(2);
  if(!contractPath||!graphPath||!outPath) fail("usage: video-asset-resolve.mjs contract.json asset-graph.json output.json");
  if(!existsSync(resolve(contractPath))) fail("contract missing");
  if(!existsSync(resolve(graphPath))) fail("asset graph missing");
  const result=applyAssetResolution(load(contractPath),load(graphPath),{graphPath});
  writeFileSync(resolve(outPath),JSON.stringify(result,null,2)+"\n");
  process.stdout.write(JSON.stringify({
    ok:true,
    output:resolve(outPath),
    full_reuse_scenes:result.asset_resolution.full_reuse_scenes.length,
    generation_required_scenes:result.asset_resolution.generation_required_scenes.length,
    generation_slots:result.asset_resolution.generation_slots.length
  })+"\n");
}
