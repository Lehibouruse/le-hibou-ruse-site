#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function fail(message){ throw new Error(message); }
function text(v){ return String(v??"").trim(); }
function normTag(v){ return text(v).normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9_-]+/g,"-").replace(/^-+|-+$/g,""); }
function uniq(values){ return [...new Set(values.filter(Boolean))].sort(); }
function stableId(entry){
  const basis=[entry.kind,entry.sha256||"",entry.path||"",entry.version||"1",...(entry.tags||[])].join("|");
  return "asset-"+createHash("sha256").update(basis).digest("hex").slice(0,16);
}
function phashDistance(a,b){
  const x=text(a), y=text(b);
  if(!x||!y||x.length!==y.length) return null;
  let d=0; for(let i=0;i<x.length;i+=1) if(x[i]!==y[i]) d+=1;
  return d;
}

export function normalizeAsset(entry){
  const kind=normTag(entry?.kind);
  const path=text(entry?.path);
  const sha256=text(entry?.sha256).toLowerCase();
  if(!kind) fail("asset kind required");
  if(!path) fail("asset path required");
  if(sha256 && !/^[a-f0-9]{64}$/.test(sha256)) fail("asset sha256 must be 64 hex chars");
  const tags=uniq((entry.tags||[]).map(normTag));
  const qualityStatus=normTag(entry.quality_status||"legacy_unspecified");
  const compatibleSceneTypes=uniq((entry.compatible_scene_types||[]).map(normTag));
  const palette=uniq((entry.palette||[]).map(text));
  const provenance={
    type:normTag(entry.provenance?.type||entry.source_type||"local"),
    source:text(entry.provenance?.source||entry.source||"local"),
    license:text(entry.provenance?.license||entry.license||"unspecified"),
    license_reference:text(entry.provenance?.license_reference||entry.license_reference||"")
  };
  const generation={
    prompt:text(entry.generation?.prompt||entry.prompt||""),
    seed:Number.isFinite(Number(entry.generation?.seed??entry.seed))?Number(entry.generation?.seed??entry.seed):null,
    model:text(entry.generation?.model||entry.model||""),
    workflow_version:text(entry.generation?.workflow_version||entry.workflow_version||"")
  };
  return {
    asset_id:text(entry.asset_id)||stableId({kind,path,sha256,tags,version:text(entry.version)||"1"}),
    kind,
    path,
    sha256:sha256||null,
    phash:text(entry.phash)||null,
    tags,
    width:Number.isFinite(Number(entry.width))?Number(entry.width):null,
    height:Number.isFinite(Number(entry.height))?Number(entry.height):null,
    transparent:entry.transparent===true,
    anchor:normTag(entry.anchor||"center"),
    palette,
    version:text(entry.version)||"1",
    provenance,
    generation,
    compatible_scene_types:compatibleSceneTypes,
    quality_status:qualityStatus,
    source:provenance.source,
    aliases:uniq((entry.aliases||[]).map(text)),
    reusable:entry.reusable!==false && qualityStatus!=="rejected",
  };
}

export function buildAssetGraph(entries,{nearDuplicateDistance=4}={}){
  const byHash=new Map();
  const assets=[];
  for(const raw of entries||[]){
    const asset=normalizeAsset(raw);
    if(asset.sha256 && byHash.has(asset.sha256)){
      const prior=byHash.get(asset.sha256);
      prior.tags=uniq([...prior.tags,...asset.tags]);
      prior.aliases=uniq([...prior.aliases,asset.path,...asset.aliases]);
      prior.transparent=prior.transparent||asset.transparent;
      prior.compatible_scene_types=uniq([...(prior.compatible_scene_types||[]),...(asset.compatible_scene_types||[])]);
      prior.palette=uniq([...(prior.palette||[]),...(asset.palette||[])]);
      if(prior.quality_status!=="validated"&&asset.quality_status==="validated") prior.quality_status="validated";
      if(prior.provenance?.license==="unspecified"&&asset.provenance?.license!=="unspecified") prior.provenance=asset.provenance;
      continue;
    }
    assets.push(asset);
    if(asset.sha256) byHash.set(asset.sha256,asset);
  }
  const near_duplicates=[];
  for(let i=0;i<assets.length;i+=1){
    for(let j=i+1;j<assets.length;j+=1){
      const a=assets[i],b=assets[j];
      if(a.kind!==b.kind||!a.phash||!b.phash) continue;
      const distance=phashDistance(a.phash,b.phash);
      if(distance!==null && distance<=nearDuplicateDistance){
        near_duplicates.push({asset_a:a.asset_id,asset_b:b.asset_id,distance,auto_merged:false});
      }
    }
  }
  return {
    schema:"HIBOU_ASSET_GRAPH_V1",
    assets,
    near_duplicates,
    policy:{
      exact_sha256_duplicates_merged:true,
      phash_near_duplicates_auto_merged:false,
      phash_review_distance_max:nearDuplicateDistance,
      generation_only_when_no_reusable_match:true,
      prefer_validated_assets:true,
      rejected_assets_never_reused:true,
      preserve_provenance_and_license:true,
    },
  };
}

export function resolveAsset(graph,query){
  if(graph?.schema!=="HIBOU_ASSET_GRAPH_V1") fail("unsupported asset graph");
  const kind=normTag(query?.kind);
  if(!kind) fail("query kind required");
  const required=uniq((query.required_tags||[]).map(normTag));
  const optional=uniq((query.optional_tags||[]).map(normTag));
  const sceneType=normTag(query?.scene_type||"");
  const candidates=(graph.assets||[])
    .filter(a=>a.reusable!==false && a.kind===kind)
    .filter(a=>required.every(tag=>(a.tags||[]).includes(tag)))
    .filter(a=>!sceneType || !(a.compatible_scene_types||[]).length || a.compatible_scene_types.includes(sceneType))
    .map(a=>{
      const optional_hits=optional.filter(tag=>(a.tags||[]).includes(tag));
      const qualityBonus=a.quality_status==="validated"?20:a.quality_status==="candidate"?5:0;
      const sceneBonus=sceneType&&(a.compatible_scene_types||[]).includes(sceneType)?8:0;
      const licenseBonus=a.provenance?.license&&a.provenance.license!=="unspecified"?3:0;
      const score=required.length*100+optional_hits.length*10+qualityBonus+sceneBonus+licenseBonus+(a.transparent?2:0);
      return {asset:a,score,optional_hits};
    })
    .sort((a,b)=>b.score-a.score || a.asset.asset_id.localeCompare(b.asset.asset_id));
  return candidates[0]||null;
}

export function planSceneAssetReuse(scene,graph){
  const requirements=Array.isArray(scene?.asset_requirements)?scene.asset_requirements:[];
  const slots=[];
  for(const req of requirements){
    const slot=text(req.slot);
    if(!slot) fail("asset requirement slot required");
    const match=resolveAsset(graph,{...req,scene_type:req.scene_type||scene?.scene_type||""});
    slots.push({
      slot,
      kind:normTag(req.kind),
      required_tags:uniq((req.required_tags||[]).map(normTag)),
      optional_tags:uniq((req.optional_tags||[]).map(normTag)),
      scene_type:normTag(req.scene_type||scene?.scene_type||""),
      action:match?"reuse":"generate",
      asset_id:match?.asset.asset_id||null,
      path:match?.asset.path||null,
      match_score:match?.score??null,
    });
  }
  return {
    schema:"HIBOU_SCENE_ASSET_REUSE_PLAN_V1",
    scene_id:text(scene?.scene_id)||null,
    slots,
    reusable_count:slots.filter(x=>x.action==="reuse").length,
    generation_count:slots.filter(x=>x.action==="generate").length,
    generation_only_for_missing_slots:true,
  };
}

function loadEntries(paths){
  const entries=[];
  for(const p of paths){
    const data=JSON.parse(readFileSync(resolve(p),"utf8"));
    if(Array.isArray(data)) entries.push(...data);
    else if(Array.isArray(data.assets)) entries.push(...data.assets);
    else fail("input must be an array or contain assets[]");
  }
  return entries;
}

if(import.meta.url===`file://${process.argv[1]}`){
  const args=process.argv.slice(2);
  const outArg=args.find(x=>x.startsWith("--out="))?.slice(6);
  const inputArgs=args.filter(x=>!x.startsWith("--"));
  if(!outArg||!inputArgs.length) fail("usage: video-asset-graph.mjs <assets.json> [more.json] --out=asset-graph.json");
  for(const p of inputArgs) if(!existsSync(resolve(p))) fail("input missing: "+p);
  const graph=buildAssetGraph(loadEntries(inputArgs));
  writeFileSync(resolve(outArg),JSON.stringify(graph,null,2)+"\n");
  process.stdout.write(JSON.stringify({ok:true,assets:graph.assets.length,near_duplicates:graph.near_duplicates.length,output:resolve(outArg)})+"\n");
}
