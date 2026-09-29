#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const POSE_REGISTRY_SCHEMA="HIBOU_POSE_REGISTRY_V1";

function fail(message){throw new Error(message);}

export function validatePoseRegistry(registry){
  if(!registry||registry.schema!==POSE_REGISTRY_SCHEMA) fail("unsupported Hibou pose registry schema");
  if(!Array.isArray(registry.poses)||registry.poses.length===0) fail("pose registry is empty");
  const seen=new Set();
  for(const pose of registry.poses){
    if(!pose?.id||!pose?.category) fail("pose requires id and category");
    if(seen.has(pose.id)) fail(`duplicate pose id: ${pose.id}`);
    seen.add(pose.id);
    if(pose.status==="ready"&&!pose.asset_ref) fail(`ready pose missing asset_ref: ${pose.id}`);
  }
  return registry;
}

export function loadPoseRegistry(path){
  return validatePoseRegistry(JSON.parse(readFileSync(path,"utf8")));
}

export function resolvePose(registry, request, {availableOnly=true}={}){
  validatePoseRegistry(registry);
  const wanted=String(typeof request==="string"?request:request?.category||request?.id||"").trim();
  if(!wanted) fail("pose request missing category/id");
  const tags=new Set((typeof request==="object"&&Array.isArray(request?.tags)?request.tags:[]).map(String));
  const candidates=registry.poses
    .filter(p=>p.id===wanted||p.category===wanted||p.tags?.includes(wanted))
    .filter(p=>!availableOnly||p.status==="ready")
    .map(p=>({
      ...p,
      _score:(p.id===wanted?100:0)+(p.category===wanted?50:0)+[...(p.tags||[])].filter(t=>tags.has(String(t))).length
    }))
    .sort((a,b)=>b._score-a._score||String(a.id).localeCompare(String(b.id)));
  if(!candidates.length){
    return {
      found:false,
      request:wanted,
      reason:availableOnly?"no_ready_pose":"no_matching_pose",
      generation_requested:false
    };
  }
  const pose={...candidates[0]};
  delete pose._score;
  return {found:true,pose,generation_requested:false};
}

export function poseLayer(pose, overrides={}){
  if(!pose?.asset_ref) fail("pose asset_ref missing");
  return {
    path:pose.asset_ref,
    width:Number(overrides.width??pose.default_width??430),
    anchor:String(overrides.anchor||pose.anchor||"bottom-center"),
    offset_x:Number(overrides.offset_x||0),
    offset_y:Number(overrides.offset_y||0),
    z:Number(overrides.z??20),
    remove_background:Boolean(overrides.remove_background??pose.remove_background??false)
  };
}

export function applyPoseToScene(scene, pose, {timelineWindow=null,overrides={}}={}){
  const out=JSON.parse(JSON.stringify(scene||{}));
  const layer=poseLayer(pose,overrides);
  if(timelineWindow){
    const start_s=Number(timelineWindow.start_s);
    const end_s=Number(timelineWindow.end_s);
    if(!Number.isFinite(start_s)||!Number.isFinite(end_s)||end_s<=start_s) fail("invalid pose timeline window");
    out.timeline=out.timeline||{schema:"HIBOU_SCENE_TIMELINE_V1",events:[]};
    out.timeline.events=Array.isArray(out.timeline.events)?out.timeline.events:[];
    out.timeline.events.push({
      id:String(timelineWindow.id||`pose-${pose.id}`),
      type:"pose",start_s,end_s,...layer
    });
  }else{
    out.composition=out.composition||{};
    out.composition.character_pose=layer;
  }
  out.pose_registry={
    schema:POSE_REGISTRY_SCHEMA,
    identity:"HIBOU_CANONICAL_V1",
    pose_id:pose.id,
    category:pose.category,
    asset_ref:pose.asset_ref,
    sha256:pose.sha256||null
  };
  return out;
}

export function applyPoseRegistryToContract(contract, registry, {registryPath=""}={}){
  validatePoseRegistry(registry);
  const out=JSON.parse(JSON.stringify(contract||{}));
  if(out.contract_version!=="HIBOU_VIDEO_CONTRACT_V1") fail("unsupported video contract");
  const root=registryPath?dirname(resolve(registryPath)):process.cwd();
  let applied=0, unresolved=0;
  out.scenes=(out.scenes||[]).map(scene=>{
    const request=String(scene.pose_request||"").trim();
    if(!request) return scene;
    const result=resolvePose(registry,request);
    let resolvedPose=result.found?{...result.pose}:null;
    let resolutionStatus="READY_REUSE";
    if(!resolvedPose){
      const canonical=String(out?.creative?.reference_image_local||"").trim();
      const deterministicOverlay=String(out?.creative?.reference_mode||"")==="deterministic_character_overlay";
      const hibouRequired=Boolean(scene?.framing?.hibou);
      if(deterministicOverlay&&hibouRequired&&canonical){
        resolvedPose={
          id:"canonical_fallback",
          category:"canonical_fallback",
          status:"ready",
          asset_ref:canonical,
          sha256:out?.creative?.reference_image_sha256||null,
          anchor:"bottom-center",
          default_width:430,
          remove_background:true
        };
        resolutionStatus="CANONICAL_FALLBACK";
      }else{
        unresolved+=1;
        return {
          ...scene,
          pose_registry_resolution:{
            schema:POSE_REGISTRY_SCHEMA,
            request,
            status:"UNRESOLVED",
            reason:result.reason,
            generation_requested:false
          }
        };
      }
    }
    const selected={...resolvedPose};
    selected.asset_ref=isAbsolute(selected.asset_ref)
      ?selected.asset_ref
      :resolve(root,selected.asset_ref);
    const withPose=applyPoseToScene(scene,selected);
    withPose.pose_registry_resolution={
      schema:POSE_REGISTRY_SCHEMA,
      request,
      status:resolutionStatus,
      pose_id:selected.id,
      asset_ref:selected.asset_ref,
      sha256:selected.sha256||null,
      generation_requested:false
    };
    applied+=1;
    return withPose;
  });
  out.pose_registry_application={
    schema:"HIBOU_POSE_REGISTRY_APPLICATION_V1",
    registry_schema:registry.schema,
    identity:registry.identity||"HIBOU_CANONICAL_V1",
    applied_scenes:applied,
    unresolved_scenes:unresolved,
    generation_requested:false,
    paid_fallback:false
  };
  return out;
}

if(import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [contractPath,registryPath,outputPath]=process.argv.slice(2);
  if(!contractPath||!registryPath||!outputPath){
    fail("usage: video-hibou-pose-registry.mjs contract.json registry.json output.json");
  }
  const contract=JSON.parse(readFileSync(resolve(contractPath),"utf8"));
  const registry=loadPoseRegistry(resolve(registryPath));
  const out=applyPoseRegistryToContract(contract,registry,{registryPath});
  writeFileSync(resolve(outputPath),JSON.stringify(out,null,2)+"\n","utf8");
  process.stdout.write(JSON.stringify({
    ok:true,
    schema:"HIBOU_POSE_REGISTRY_APPLICATION_V1",
    output:resolve(outputPath),
    applied_scenes:out.pose_registry_application.applied_scenes,
    unresolved_scenes:out.pose_registry_application.unresolved_scenes
  })+"\n");
}
