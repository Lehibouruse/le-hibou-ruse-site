#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function fail(message){throw new Error(message);}
export function normalizeProductionMode(value){
  const mode=String(value||"final").trim().toLowerCase();
  if(!["preview","final"].includes(mode)) fail("production.mode must be preview or final");
  return mode;
}

const PLAN_DIR=dirname(fileURLToPath(import.meta.url));
const VERIFIED_HARDWARE_PROFILE="rog-g814ji-rtx4070-8gb.json";

function isVerticalProfile(profile){
  const width=Number(profile?.width);
  const height=Number(profile?.height);
  const ratio=width/height;
  return Number.isFinite(width)
    && Number.isFinite(height)
    && width>0
    && height>0
    && Number.isFinite(ratio)
    && Math.abs(ratio-(9/16))<=0.05;
}

function verifiedHardwareProfiles(){
  const candidates=[
    resolve(PLAN_DIR,VERIFIED_HARDWARE_PROFILE),
    resolve("video/hardware",VERIFIED_HARDWARE_PROFILE)
  ];
  for(const candidate of candidates){
    try{
      if(!existsSync(candidate)) continue;
      const profile=JSON.parse(readFileSync(candidate,"utf8"));
      const primary=profile?.image?.smoke_profile;
      const fallback=profile?.image?.fallback_profile;
      if(!isVerticalProfile(primary)) continue;
      return {
        hardware_profile_id:String(profile?.profile_id||"").trim()||null,
        primary:{
          width:Number(primary.width),
          height:Number(primary.height),
          batch_size:Number(primary.batch_size||1)
        },
        fallback:isVerticalProfile(fallback)?{
          width:Number(fallback.width),
          height:Number(fallback.height),
          batch_size:Number(fallback.batch_size||1)
        }:null
      };
    }catch{}
  }
  return {
    hardware_profile_id:"ROG_G814JI_RTX4070_8GB_V1",
    primary:{width:768,height:1344,batch_size:1},
    fallback:{width:640,height:1136,batch_size:1}
  };
}

function seedFor(contentId,sceneId,candidate){
  const h=createHash("sha256").update(`${contentId}|${sceneId}|${candidate}`).digest();
  return h.readUInt32BE(0);
}

function sha256Text(value){
  return createHash("sha256").update(String(value||""),"utf8").digest("hex");
}

const BACKGROUND_STYLE_SECTION_LABELS=[
  "STYLE",
  "DÉCOR",
  "DECOR",
  "GRAMMAIRE CONCURRENTIELLE ADAPTÉE",
  "GRAMMAIRE CONCURRENTIELLE ADAPTEE"
];

function extractBackgroundStyleLock(styleLock){
  const source=String(styleLock||"").trim();
  if(!source) return "";
  const labelRe=/(?:^|\n|\.\s+)([A-ZÀ-ÖØ-ÝŒÆÉÈÊËÀÂÄÙÛÜÎÏÔÖÇ][A-ZÀ-ÖØ-ÝŒÆÉÈÊËÀÂÄÙÛÜÎÏÔÖÇ0-9 /&'’-]{2,})\s*:\s*/gu;
  const matches=[...source.matchAll(labelRe)];
  if(matches.length){
    const kept=[];
    for(let i=0;i<matches.length;i+=1){
      const label=String(matches[i][1]||"").trim();
      const start=matches[i].index+matches[i][0].length;
      const end=i+1<matches.length?matches[i+1].index:source.length;
      if(BACKGROUND_STYLE_SECTION_LABELS.includes(label)){
        kept.push(`${label}: ${source.slice(start,end).trim().replace(/[.\s]+$/u,"")}`);
      }
    }
    if(kept.length) return kept.join(". ");
  }
  return source
    .split(/(?<=[.!?])\s+/u)
    .filter(part=>!/\b(?:hibou|owl|oiseau|bird|mascotte|mascot|personnage|character|monocle|plumage|plumes|yeux|tête|corps|costume|dandy)\b/iu.test(part))
    .join(" ")
    .trim();
}

export function compileBackgroundPromptPolicy(creative,sceneCore){
  const styleLock=String(creative?.style_lock||"").trim();
  const characterLock=String(creative?.character_lock||"").trim();
  const contentBrief=String(creative?.content_brief||"").trim();
  const negativeLock=String(creative?.negative_prompt||"").trim();
  const scenePrompt=String(sceneCore||"").trim();
  return {
    background_style_lock:extractBackgroundStyleLock(
      String(creative?.background_style_lock||"").trim()||styleLock
    ),
    scene_prompt:scenePrompt,
    negative_prompt:negativeLock,
    provenance:{
      global_style_sha256:sha256Text(styleLock),
      character_lock_sha256:sha256Text(characterLock),
      specific_brief_sha256:sha256Text(contentBrief),
      scene_prompt_sha256:sha256Text(scenePrompt),
      character_lock_route:"deterministic_character_overlay",
      specific_brief_route:"scene_contract_not_raw_image_conditioning"
    }
  };
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

  const verified=verifiedHardwareProfiles();
  const requestedProfile=out.profile||verified.primary;
  const normalizedRequested={
    width:Number(requestedProfile?.width||0),
    height:Number(requestedProfile?.height||0),
    batch_size:Number(requestedProfile?.batch_size||1)
  };

  if(isVerticalProfile(normalizedRequested)){
    out.profile=normalizedRequested;
    out.profile_migrated=false;
  }else{
    out.profile=verified.primary;
    out.profile_migrated=true;
    out.profile_migration={
      reason:"legacy_non_vertical_profile",
      from:{
        width:Number.isFinite(normalizedRequested.width)?normalizedRequested.width:null,
        height:Number.isFinite(normalizedRequested.height)?normalizedRequested.height:null,
        batch_size:normalizedRequested.batch_size
      },
      to:verified.primary,
      hardware_profile_id:verified.hardware_profile_id
    };
  }

  if(out.fallback_profile&&isVerticalProfile(out.fallback_profile)){
    out.fallback_profile={
      width:Number(out.fallback_profile.width),
      height:Number(out.fallback_profile.height),
      batch_size:Number(out.fallback_profile.batch_size||1)
    };
    out.fallback_profile_migrated=false;
  }else{
    out.fallback_profile=verified.fallback;
    out.fallback_profile_migrated=Boolean(verified.fallback);
  }

  out.hardware_profile_id=out.hardware_profile_id||verified.hardware_profile_id;

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
  const creative=contract?.creative||{};
  const production=contract?.production||{};
  const productionMode=normalizeProductionMode(production.mode);
  const characterLock=String(creative.character_lock||"").trim();
  const styleLock=String(creative.style_lock||"").trim();
  const negativeLock=String(creative.negative_prompt||"").trim();
  const contentBrief=String(creative.content_brief||"").trim();
  const creativeLockEnabled=Boolean(
    Object.keys(creative||{}).length
    && (
      styleLock
      || characterLock
      || negativeLock
      || contentBrief
      || creative.text_in_generated_images===false
      || creative.reference_mode
    )
  );
  const textFreeLock=creativeLockEnabled?[
    "TEXT_FREE_IMAGE_LOCK:",
    "Do not render any letters, words, captions, labels, signage, logos, pseudo-text or gibberish inside the generated image.",
    "All useful text, numbers, captions and the Le Hibou Rusé signature are added later in post-production.",
    "The image itself must contain zero readable text."
  ].join(" "):"";
  const modeCandidates=productionMode==="preview"
    ?Number(production.preview_candidates_per_scene??1)
    :Number(production.final_candidates_per_scene??binding.candidates_per_scene??3);
  const defaultCandidates=Number.isFinite(modeCandidates)?modeCandidates:(productionMode==="preview"?1:3);
  const requestedCandidates=production.candidates_per_scene==null||production.candidates_per_scene===""
    ?defaultCandidates
    :Number(production.candidates_per_scene);
  const candidatesPerScene=Math.max(
    1,
    Math.min(3,Number.isFinite(requestedCandidates)?requestedCandidates:defaultCandidates)
  );
  const primaryProfile=productionMode==="preview"&&binding.fallback_profile
    ?binding.fallback_profile
    :binding.profile;
  const fallbackProfile=productionMode==="preview"?null:binding.fallback_profile;
  const requests=[];
  const skipped_full_reuse=[];
  for(const scene of contract.scenes||[]){
    if(scene?.asset_resolution?.status==="FULL_REUSE"){
      skipped_full_reuse.push(scene.scene_id);
      continue;
    }
    const core=String(scene.image_prompt||scene.visual_idea||"").trim();
    if(!core) fail(`${scene.scene_id}: image prompt/visual idea missing`);
    const deterministicCharacterOverlay=
      creativeLockEnabled
      && String(creative.reference_mode||"")==="deterministic_character_overlay"
      && Boolean(scene?.framing?.hibou);
    const sceneWantsHibou=Boolean(scene?.framing?.hibou);
    const characterGenerationLock=deterministicCharacterOverlay
      ? [
          "BACKGROUND_ONLY_LOCK:",
          "Do not render any owl, bird, animal, mascot or human in this image.",
          "The canonical Le Hibou Rusé character is composited later in post-production.",
          "Leave a visually useful foreground area for the character overlay while keeping the environment rich and complete."
        ].join(" ")
      : creativeLockEnabled && !sceneWantsHibou
        ? [
            "NO_CHARACTER_LOCK:",
            "Do not render any owl, bird, animal, mascot or human.",
            "Tell the idea using environment, objects, symbols and composition only."
          ].join(" ")
        : creativeLockEnabled
          ? characterLock
          : "";
    const compiledPromptPolicy=compileBackgroundPromptPolicy(creative,core);
    const backgroundOnly=deterministicCharacterOverlay||(creativeLockEnabled&&!sceneWantsHibou);
    const imageStyleLock=backgroundOnly
      ?compiledPromptPolicy.background_style_lock
      :styleLock;
    const prompt=creativeLockEnabled
      ? [
          prefix,
          characterGenerationLock,
          imageStyleLock,
          backgroundOnly?"":characterLock,
          core,
          negativeLock?("ABSOLUTELY AVOID: "+negativeLock):"",
          textFreeLock,
          suffix
        ].filter(Boolean).join("\n")
      : [prefix,core,suffix].filter(Boolean).join(" ");
    for(let candidate=1;candidate<=candidatesPerScene;candidate+=1){
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
      const request=requestForProfile(primaryProfile);
      const fallbackRequest=fallbackProfile?.width&&fallbackProfile?.height&&binding?.size?.node_id
        ?requestForProfile(fallbackProfile)
        :null;
      requests.push({
        candidate_id:`${scene.scene_id}-C${candidate}`,
        scene_id:scene.scene_id,
        candidate,
        seed,
        prompt_application:{
          mode:backgroundOnly?"background_only":"direct_scene_generation",
          global_style_applied:Boolean(imageStyleLock),
          scene_specific_prompt_applied:true,
          raw_specific_brief_injected:false,
          raw_character_lock_injected:!backgroundOnly&&Boolean(characterLock),
          ...compiledPromptPolicy.provenance
        },
        request,
        fallback_request:fallbackRequest
      });
    }
  }
  return {schema:"HIBOU_IMAGE_PLAN_V1",content_id:contentId,scene_count:contract.scenes.length,generation_scene_count:new Set(requests.map(x=>x.scene_id)).size,skipped_full_reuse,candidates_per_scene:candidatesPerScene,production_mode:productionMode,preview_profile_applied:productionMode==="preview"&&Boolean(binding.fallback_profile),request_count:requests.length,requests,size_binding:binding.size,profile:primaryProfile,fallback_profile:fallbackProfile||null,size_binding_repaired:Boolean(binding.size_binding_repaired),profile_migrated:Boolean(binding.profile_migrated),profile_migration:binding.profile_migration||null,fallback_profile_migrated:Boolean(binding.fallback_profile_migrated),hardware_profile_id:binding.hardware_profile_id||null,paid_fallback:false};
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
