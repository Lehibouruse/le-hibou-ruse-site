#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const PLANNING_MANIFEST_SCHEMA="HIBOU_VIDEO_PLANNING_MANIFEST_V1";

function fail(message){ throw new Error(message); }
function stable(value){
  if(Array.isArray(value)) return value.map(stable);
  if(!value || typeof value!=="object") return value;
  return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])]));
}
function stableJson(value){ return JSON.stringify(stable(value)); }
function hashJson(value){ return createHash("sha256").update(stableJson(value),"utf8").digest("hex"); }
function text(value){ return String(value??"").trim(); }

const DEFINITIONS=[
  ["prompt_graph","HIBOU_VIDEO_PROMPT_GRAPH_V1","prompt_graph_sha256"],
  ["motion_plan","HIBOU_VIDEO_MOTION_PLAN_V1","motion_plan_sha256"],
  ["voice_density_plan","HIBOU_VIDEO_VOICE_DENSITY_PLAN_V1","voice_density_plan_sha256"],
  ["continuity_plan","HIBOU_VISUAL_CONTINUITY_PLAN_V1","continuity_plan_sha256"],
  ["asset_readiness","HIBOU_ASSET_GRAPH_READINESS_V1",null],
];

function artifactReceipt(name,value,required){
  if(!value){
    if(required) fail(`${name} is required`);
    return null;
  }
  const definition=DEFINITIONS.find(row=>row[0]===name);
  if(!definition) fail(`unknown planning artifact ${name}`);
  const [,expectedSchema,declaredHashField]=definition;
  if(value.schema!==expectedSchema){
    fail(`${name} schema mismatch: expected ${expectedSchema}`);
  }
  const contentSha=hashJson(value);
  const declaredSha=declaredHashField?text(value[declaredHashField]):null;
  if(declaredHashField && !/^[0-9a-f]{64}$/i.test(declaredSha)){
    fail(`${name} missing valid ${declaredHashField}`);
  }
  return {
    name,
    schema:value.schema,
    content_sha256:contentSha,
    declared_sha256:declaredSha||null,
    declared_hash_field:declaredHashField,
    publication_authorized:false,
  };
}

function scenePromptReceipts(promptGraph,storyboard){
  const graphNodes=new Map(
    (promptGraph?.nodes||[])
      .filter(node=>node?.kind==="SCENE_PROMPT")
      .map(node=>[String(node?.SCENE_DELTA?.scene_id||""),node])
      .filter(([id])=>id)
  );
  return (storyboard?.scenes||[]).map(scene=>{
    const sceneId=String(scene?.scene_id||"").trim();
    if(!sceneId) fail("storyboard scene_id missing");
    const node=graphNodes.get(sceneId);
    if(!node) fail(`Prompt Graph missing SCENE_PROMPT for ${sceneId}`);
    const sceneImageSource=String(scene?.image_prompt||scene?.visual_idea||"").trim();
    const graphImageSource=String(node?.SCENE_DELTA?.image_prompt||node?.SCENE_DELTA?.visual_idea||"").trim();
    const sourceMatches=sceneImageSource===graphImageSource;
    return {
      scene_id:sceneId,
      prompt_graph_node_id:String(node.id||""),
      prompt_graph_node_sha256:hashJson(node),
      scene_delta_sha256:hashJson(node.SCENE_DELTA||{}),
      attention_beats_sha256:hashJson(node.ATTENTION_BEATS||[]),
      image_source_sha256:createHash("sha256").update(sceneImageSource,"utf8").digest("hex"),
      graph_image_source_sha256:createHash("sha256").update(graphImageSource,"utf8").digest("hex"),
      source_matches_graph:sourceMatches,
    };
  });
}

export function buildPlanningManifest({
  storyboard,
  prompt_graph,
  motion_plan,
  voice_density_plan,
  continuity_plan,
  asset_readiness=null,
  runtime_commit=null,
}={}){
  if(storyboard?.contract_version!=="HIBOU_VIDEO_CONTRACT_V1"){
    fail("HIBOU_VIDEO_CONTRACT_V1 storyboard required");
  }
  const receipts={};
  for(const [name] of DEFINITIONS){
    const required=name!=="asset_readiness";
    receipts[name]=artifactReceipt(name,arguments[0]?.[name]??null,required);
  }

  const sceneReceipts=scenePromptReceipts(prompt_graph,storyboard);
  const mismatchedScenes=sceneReceipts.filter(x=>!x.source_matches_graph).map(x=>x.scene_id);
  if(mismatchedScenes.length){
    fail("Prompt Graph scene source drift: "+mismatchedScenes.join(","));
  }

  const core={
    schema:PLANNING_MANIFEST_SCHEMA,
    content_id:String(storyboard?.content?.content_id||"").trim()||null,
    runtime_commit:text(runtime_commit)||text(storyboard?.runtime_commit)||null,
    storyboard_sha256:hashJson(storyboard),
    artifacts:receipts,
    scene_prompt_receipts:sceneReceipts,
    scene_count:sceneReceipts.length,
    asset_readiness_included:Boolean(asset_readiness),
    policy:{
      planning_only:true,
      read_only:true,
      model_calls_performed:false,
      gpu_execution_performed:false,
      airtable_mutation_performed:false,
      storyboard_mutation_performed:false,
      render_execution_performed:false,
      publication_authorized:false,
      all_scene_sources_must_match_prompt_graph:true,
    },
  };
  return {...core,planning_manifest_sha256:hashJson(core)};
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [bundlePath,outputPath]=process.argv.slice(2);
  if(!bundlePath||!outputPath){
    fail("usage: node scripts/video-planning-manifest.mjs planning-bundle.json planning-manifest.json");
  }
  const bundle=JSON.parse(readFileSync(resolve(bundlePath),"utf8"));
  const manifest=buildPlanningManifest(bundle);
  writeFileSync(resolve(outputPath),JSON.stringify(manifest,null,2)+"\n","utf8");
  process.stdout.write(JSON.stringify({
    ok:true,
    schema:manifest.schema,
    output:resolve(outputPath),
    scene_count:manifest.scene_count,
    planning_manifest_sha256:manifest.planning_manifest_sha256,
    execution_performed:false,
    publication_authorized:false,
  })+"\n");
}
