#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

function fail(message){throw new Error(message);}
function seedFor(contentId,sceneId,candidate){
  const h=createHash("sha256").update(`${contentId}|${sceneId}|${candidate}`).digest();
  return h.readUInt32BE(0);
}

function workflowNodes(workflow){
  return Object.entries(workflow||{}).filter(([,node])=>
    node&&typeof node==="object"&&node.inputs&&typeof node.inputs==="object"
  );
}

function validSizeNode(workflow,size){
  if(!size?.node_id) return false;
  const node=workflow?.[String(size.node_id)];
  if(!node?.inputs) return false;
  const widthKey=size.width_input||"width";
  const heightKey=size.height_input||"height";
  return Object.prototype.hasOwnProperty.call(node.inputs,widthKey)
    && Object.prototype.hasOwnProperty.call(node.inputs,heightKey);
}

function discoverSizeNode(workflow){
  const candidates=workflowNodes(workflow)
    .map(([id,node])=>{
      const inputs=node.inputs||{};
      if(!Object.prototype.hasOwnProperty.call(inputs,"width")
        || !Object.prototype.hasOwnProperty.call(inputs,"height")) return null;
      const classType=String(node.class_type||"").toLowerCase();
      let score=12;
      if(classType.includes("latent")) score+=4;
      if(classType.includes("image")) score+=2;
      if(Object.prototype.hasOwnProperty.call(inputs,"batch_size")) score+=2;
      return {
        node_id:String(id),
        width_input:"width",
        height_input:"height",
        batch_input:Object.prototype.hasOwnProperty.call(inputs,"batch_size")?"batch_size":null,
        class_type:node.class_type||null,
        score
      };
    })
    .filter(Boolean)
    .sort((a,b)=>b.score-a.score||a.node_id.localeCompare(b.node_id));
  return candidates[0]||null;
}

export function normalizeSizeBinding(binding){
  const out=structuredClone(binding||{});
  const workflowPath=String(out.workflow_path||"").trim();
  if(!workflowPath) fail("binding.workflow_path required");
  if(!existsSync(resolve(workflowPath))) fail("binding workflow_path missing: "+resolve(workflowPath));
  const workflow=JSON.parse(readFileSync(resolve(workflowPath),"utf8"));

  if(!validSizeNode(workflow,out.size)){
    const repaired=discoverSizeNode(workflow);
    if(!repaired) fail("ComfyUI workflow has no controllable width/height node");
    out.size=repaired;
    out.size_binding_repaired=true;
  }else{
    out.size_binding_repaired=false;
  }

  const canonicalPrimary={width:768,height:1344,batch_size:1};
  const canonicalFallback={width:640,height:1136,batch_size:1};
  const normalizeProfile=(value,fallback)=>{
    const p={
      width:Number(value?.width||fallback.width),
      height:Number(value?.height||fallback.height),
      batch_size:Number(value?.batch_size||fallback.batch_size||1)
    };
    const ratio=p.width/p.height;
    const valid=Number.isFinite(p.width)
      && Number.isFinite(p.height)
      && p.width>0
      && p.height>0
      && Number.isFinite(ratio)
      && Math.abs(ratio-(9/16))<=0.05;
    return {profile:p,valid};
  };

  const originalPrimary=out.profile?structuredClone(out.profile):null;
  const primary=normalizeProfile(out.profile,canonicalPrimary);
  if(primary.valid){
    out.profile=primary.profile;
    out.profile_repaired=false;
  }else{
    out.profile=canonicalPrimary;
    out.profile_repaired=true;
    out.original_profile=originalPrimary;
  }

  const originalFallback=out.fallback_profile?structuredClone(out.fallback_profile):null;
  if(out.fallback_profile){
    const fallback=normalizeProfile(out.fallback_profile,canonicalFallback);
    if(fallback.valid){
      out.fallback_profile=fallback.profile;
      out.fallback_profile_repaired=false;
    }else{
      out.fallback_profile=canonicalFallback;
      out.fallback_profile_repaired=true;
      out.original_fallback_profile=originalFallback;
    }
  }else{
    out.fallback_profile=canonicalFallback;
    out.fallback_profile_repaired=true;
    out.original_fallback_profile=null;
  }

  return out;
}
export function buildImagePlan(contract,binding){
  binding=normalizeSizeBinding(binding);
  if(contract.contract_version!=="HIBOU_VIDEO_CONTRACT_V1") fail("unsupported contract version");
  if(contract.contract_state!=="storyboard") fail("image planning expects storyboard contract");
  if(!binding?.workflow_path) fail("binding.workflow_path required");
  if(!binding?.prompt?.node_id||!binding?.prompt?.input) fail("binding.prompt node_id/input required");
  if(!binding?.seed?.node_id||!binding?.seed?.input) fail("binding.seed node_id/input required");
  if(!Array.isArray(binding.output_node_ids)||!binding.output_node_ids.length) fail("binding.output_node_ids required");
  const contentId=contract.content?.content_id;
  if(!contentId) fail("content_id missing");
  const prefix=String(binding.style_prefix||"").trim();
  const suffix=String(binding.style_suffix||"").trim();
  const requests=[];
  const skipped_full_reuse=[];
  for(const scene of contract.scenes||[]){
    if(scene?.asset_resolution?.status==="FULL_REUSE"){
      skipped_full_reuse.push(scene.scene_id);
      continue;
    }
    const core=String(scene.image_prompt||scene.visual_idea||"").trim();
    if(!core) fail(`${scene.scene_id}: image prompt/visual idea missing`);
    const prompt=[prefix,core,suffix].filter(Boolean).join(" ");
    for(let candidate=1;candidate<=3;candidate+=1){
      const seed=seedFor(contentId,scene.scene_id,candidate);
      const baseOverrides={
        [String(binding.prompt.node_id)]:{[binding.prompt.input]:prompt},
        [String(binding.seed.node_id)]:{[binding.seed.input]:seed}
      };
      const requestForProfile=(profile)=>{
        const overrides=structuredClone(baseOverrides);
        if(binding?.size?.node_id&&profile?.width&&profile?.height){
          overrides[String(binding.size.node_id)]={
            ...(overrides[String(binding.size.node_id)]||{}),
            [binding.size.width_input||"width"]:Number(profile.width),
            [binding.size.height_input||"height"]:Number(profile.height),
            ...(binding.size.batch_input?{[binding.size.batch_input]:Number(profile.batch_size||1)}:{})
          };
        }
        return {
          interface:"IMAGE_GEN_V1",
          engine:"comfyui",
          content_id:contentId,
          scene_id:`${scene.scene_id}-C${candidate}`,
          endpoint:binding.endpoint||"http://127.0.0.1:8188",
          workflow_path:binding.workflow_path,
          overrides,
          output_node_ids:binding.output_node_ids.map(String),
          timeout_seconds:Number(binding.timeout_seconds||600),
          max_retries:Number(binding.max_retries??1)
        };
      };
      const request=requestForProfile(binding.profile);
      const fallbackRequest=binding?.fallback_profile?.width&&binding?.fallback_profile?.height&&binding?.size?.node_id
        ?requestForProfile(binding.fallback_profile)
        :null;
      requests.push({
        candidate_id:`${scene.scene_id}-C${candidate}`,
        scene_id:scene.scene_id,
        candidate,
        seed,
        request,
        fallback_request:fallbackRequest
      });
    }
  }
  return {schema:"HIBOU_IMAGE_PLAN_V1",content_id:contentId,scene_count:contract.scenes.length,generation_scene_count:new Set(requests.map(x=>x.scene_id)).size,skipped_full_reuse,candidates_per_scene:3,request_count:requests.length,requests,size_binding:binding.size,profile:binding.profile,fallback_profile:binding.fallback_profile||null,size_binding_repaired:Boolean(binding.size_binding_repaired),profile_repaired:Boolean(binding.profile_repaired),fallback_profile_repaired:Boolean(binding.fallback_profile_repaired),original_profile:binding.original_profile||null,original_fallback_profile:binding.original_fallback_profile||null,paid_fallback:false};
}
if(import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [contractPath,bindingPath,outPath]=process.argv.slice(2);
  if(!contractPath||!bindingPath||!outPath) fail("usage: video-image-plan.mjs storyboard.json comfyui-binding.json image-plan.json");
  const contract=JSON.parse(readFileSync(resolve(contractPath),"utf8"));
  const binding=JSON.parse(readFileSync(resolve(bindingPath),"utf8"));
  const plan=buildImagePlan(contract,binding);
  mkdirSync(dirname(resolve(outPath)),{recursive:true});
  writeFileSync(resolve(outPath),JSON.stringify(plan,null,2));
  process.stdout.write(JSON.stringify({ok:true,output:resolve(outPath),requests:plan.request_count})+"\n");
}
