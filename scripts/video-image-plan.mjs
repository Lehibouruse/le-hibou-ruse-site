#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function fail(message){throw new Error(message);}
function seedFor(contentId,sceneId,candidate){
  const h=createHash("sha256").update(`${contentId}|${sceneId}|${candidate}`).digest();
  return h.readUInt32BE(0);
}
export function buildImagePlan(contract,binding){
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
  for(const scene of contract.scenes||[]){
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
  return {schema:"HIBOU_IMAGE_PLAN_V1",content_id:contentId,scene_count:contract.scenes.length,candidates_per_scene:3,request_count:requests.length,requests,paid_fallback:false};
}
if(import.meta.url===`file://${process.argv[1]}`){
  const [contractPath,bindingPath,outPath]=process.argv.slice(2);
  if(!contractPath||!bindingPath||!outPath) fail("usage: video-image-plan.mjs storyboard.json comfyui-binding.json image-plan.json");
  const contract=JSON.parse(readFileSync(resolve(contractPath),"utf8"));
  const binding=JSON.parse(readFileSync(resolve(bindingPath),"utf8"));
  const plan=buildImagePlan(contract,binding);
  mkdirSync(dirname(resolve(outPath)),{recursive:true});
  writeFileSync(resolve(outPath),JSON.stringify(plan,null,2));
  process.stdout.write(JSON.stringify({ok:true,output:resolve(outPath),requests:plan.request_count})+"\n");
}
