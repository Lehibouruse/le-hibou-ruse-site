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

function meetsImageFloor(profile){
  const width=Number(profile?.width);
  const height=Number(profile?.height);
  return Number.isFinite(width)
    && Number.isFinite(height)
    && width>=512
    && height>=896;
}

function extractStyleSection(styleLock){
  const source=String(styleLock||"").trim();
  if(!source) return "";
  const match=source.match(/STYLE\s*:\s*([\s\S]*?)(?=\s+(?:DÉCOR|DECOR|COHÉRENCE|COHERENCE|GRAMMAIRE|MOUVEMENT|CADENCE|SOUS-TITRES|BRANDING|LANGUE|TEXTE DANS LES IMAGES|CTA|PRIORITÉ|PRIORITE)\s*:|$)/i);
  return String(match?.[1]||"").trim();
}

const CHARACTER_TOKEN_RE=/(?:\bhibou\b|\bowl\b|\bbird\b|\banimal\b|\bmascot\b|\bmascotte\b)/iu;

function scrubOverlayCharacterClause(clause){
  let value=String(clause||"").trim();
  if(!value) return "";
  if(!CHARACTER_TOKEN_RE.test(value)) return value;

  const action=value.match(/\b(retirant|retirer|effaçant|effacer|supprimant|supprimer)\s+([^.;!?]+)/iu);
  if(action){
    const verb=/retirant|retirer/iu.test(action[1])?"retirer":/effaçant|effacer/iu.test(action[1])?"effacer":"supprimer";
    return `Action visuelle sans personnage : ${verb} ${String(action[2]).trim()}`;
  }

  value=value
    .replace(/\s+(?:réservé(?:e)?|destiné(?:e)?|prévu(?:e)?)\s+(?:pour|au|à)\s+(?:le\s+)?(?:hibou|owl|bird|animal|mascot|mascotte)(?:\s+canonique)?\b[^,;.!?]*/giu,"")
    .replace(/\s+(?:zone|espace|place)\s+[^,;.!?]*?\s+(?:réservé(?:e)?|destiné(?:e)?|prévu(?:e)?)\s+(?:pour|au|à)\s+(?:le\s+)?(?:hibou|owl|bird|animal|mascot|mascotte)(?:\s+canonique)?\b[^,;.!?]*/giu,"")
    .replace(/\s+(?:avec\s+)?(?:une?\s+)?(?:zone|espace|place)\s+[^,;.!?]*?\s+pour\s+(?:le\s+)?(?:hibou|owl|bird|animal|mascot|mascotte)(?:\s+canonique)?\b[^,;.!?]*/giu,"");

  if(CHARACTER_TOKEN_RE.test(value)){
    value=value
      .replace(/^\s*(?:le|la|un|une|the|an?)?\s*(?:hibou|owl|bird|animal|mascot|mascotte)(?:\s+canonique)?\s+/iu,"")
      .replace(/\b(?:le|la|un|une|du|au|the|an?)?\s*(?:hibou|owl|bird|animal|mascot|mascotte)(?:\s+canonique)?\b/giu,"")
      .replace(/\s{2,}/g," ")
      .trim();
  }
  return value;
}

function removeOverlayCharacterSentences(text){
  const source=String(text||"").trim();
  if(!source) return "";
  return source
    .split(/(?<=[.!?])\s+/u)
    .flatMap(sentence=>sentence.split(/\s*;\s*/u))
    .map(scrubOverlayCharacterClause)
    .filter(Boolean)
    .join(". ")
    .replace(/\.\s*\./g,".")
    .trim();
}

function imageStylePrompt(styleLock){
  const extracted=extractStyleSection(styleLock);
  const base=extracted||String(styleLock||"").trim();
  const reinforcement="STYLE_RENDERING_GUIDE: flat vector-like 2D editorial illustration, crisp ink outlines, simplified geometry, controlled cel shading, restrained texture, graphic poster-like composition, consistent ivory/navy/gold accents, shallow illustrative depth.";
  return [base?("IMAGE_STYLE_LOCK: "+base):"",reinforcement].filter(Boolean).join(" ");
}

function removeTextRiskSentences(text){
  const source=String(text||"").trim();
  if(!source) return "";
  const withoutTextInstructions=source
    .split(/(?<=[.!?])\s+/u)
    .filter(sentence=>!/(?:\btexte\b|\btext\b|\bletter(?:s|ing)?\b|\blogo\b|\bsign(?:age)?\b|\bécriture\b|\binscription\b)/iu.test(sentence))
    .join(" ")
    .trim();
  return withoutTextInstructions
    .replace(/\b20\d{2}\b/g,"abstract timeline milestone")
    .replace(/[+-]?\d+(?:[.,]\d+)?\s*%/g,"abstract percentage marker")
    .replace(/\b\d[\d\s.,]*\s*€\b/g,"abstract currency marker")
    .replace(/\s{2,}/g," ")
    .trim();
}

function framingPrompt(scene){
  const type=String(scene?.framing?.type||"").trim().toLowerCase();
  const rawAnchor=String(scene?.framing?.anchor||"").trim().toLowerCase();
  const anchor=rawAnchor==="centre"?"center":rawAnchor;
  let base="";
  if(/split/.test(type)){
    base="FRAMING_LOCK: strict two-panel split-screen composition with a clean central divider; left and right panels must remain visually distinct, balanced and immediately comparable.";
  }else if(/sch[eé]ma|diagram/.test(type)){
    base="FRAMING_LOCK: flat diagrammatic editorial composition; simplified blocks, arrows and icons on a shallow graphic plane; generous whitespace; avoid room-like perspective.";
  }else if(/narrative|sc[eè]ne/.test(type)){
    base="FRAMING_LOCK: narrative editorial composition with a clear left-to-right visual action path, one dominant focal action and simplified supporting environment.";
  }else if(/macro|close|gros/.test(type)){
    base="FRAMING_LOCK: tight macro close-up; the primary object must fill most of the frame; avoid room-wide establishing compositions; background stays secondary and simplified.";
  }else if(/medium|moyen/.test(type)){
    base="FRAMING_LOCK: medium editorial framing; one clear focal environment/prop composition; avoid extreme wide-angle views.";
  }else if(/wide|large|ensemble/.test(type)){
    base="FRAMING_LOCK: controlled wide editorial framing with one dominant focal subject and simplified background.";
  }else{
    base="FRAMING_LOCK: clear editorial composition with one dominant focal subject and simplified background.";
  }
  if(anchor) base+=" Preserve an open overlay-safe area toward "+anchor+".";
  return base;
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

  if(isVerticalProfile(normalizedRequested)&&meetsImageFloor(normalizedRequested)){
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

  if(out.fallback_profile&&isVerticalProfile(out.fallback_profile)&&meetsImageFloor(out.fallback_profile)){
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
  const promptContract=contract?.prompt_contract_v2;
  if(promptContract?.schema!=="HIBOU_PROMPT_CONTRACT_V2"||promptContract?.strict!==true){
    fail("strict prompt_contract_v2 required before image planning");
  }
  const promptSceneMap=new Map((promptContract.scenes||[]).map(x=>[String(x.scene_id),x]));
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
  const airtableCreativeContract=String(contract?.content?.source||"").trim().toLowerCase()==="airtable";
  if(airtableCreativeContract){
    const methodVersion=String(contract?.content?.method_version||"").trim();
    const profileVersion=String(contract?.content?.profile_version||"").trim();
    const missing=[];
    if(methodVersion!=="VIDEO_METHOD_V4.3") missing.push("content.method_version=VIDEO_METHOD_V4.3");
    if(!profileVersion.includes("V4.3")) missing.push("content.profile_version containing V4.3");
    if(!styleLock) missing.push("creative.style_lock");
    if(!characterLock) missing.push("creative.character_lock");
    if(!negativeLock) missing.push("creative.negative_prompt");
    if(!contentBrief) missing.push("creative.content_brief");
    if(String(creative.reference_mode||"")!=="deterministic_character_overlay"){
      missing.push("creative.reference_mode=deterministic_character_overlay");
    }
    if(creative.text_in_generated_images!==false){
      missing.push("creative.text_in_generated_images=false");
    }
    if(missing.length){
      fail("Airtable creative contract incomplete; refusing generic render: "+missing.join(", "));
    }
  }
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
    "CLEAN_SURFACE_LOCK:",
    "Keep plaques, paper surfaces, walls, screens and decorative panels blank and unmarked.",
    "Use clean geometric shapes and simple material details only."
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
    const promptSceneRef=promptSceneMap.get(String(scene.scene_id||""));
    if(!promptSceneRef) fail(`${scene.scene_id}: missing SPECIFIC prompt contract hash`);
    const sceneImagePrompt=String(scene.image_prompt||"").trim();
    const sceneVisualIdea=String(scene.visual_idea||"").trim();
    if(!sceneImagePrompt&&!sceneVisualIdea) fail(`${scene.scene_id}: image prompt/visual idea missing`);
    const deterministicCharacterOverlay=
      creativeLockEnabled
      && String(creative.reference_mode||"")==="deterministic_character_overlay"
      && Boolean(scene?.framing?.hibou);
    const sceneWantsHibou=Boolean(scene?.framing?.hibou);
    const rawSpecificVisual=sceneImagePrompt||sceneVisualIdea;
    const characterSafeVisual=deterministicCharacterOverlay
      ? removeOverlayCharacterSentences(rawSpecificVisual)
      : rawSpecificVisual;
    const compiledSpecificVisual=creativeLockEnabled
      ? removeTextRiskSentences(characterSafeVisual)
      : characterSafeVisual;
    if(!compiledSpecificVisual) fail(`${scene.scene_id}: compiled scene image prompt is empty`);
    const specificVisual=(sceneImagePrompt?"SCENE_IMAGE_PROMPT: ":"SCENE_VISUAL_FALLBACK: ")+compiledSpecificVisual;
    const styleForImage=imageStylePrompt(styleLock);
    const framingLock=framingPrompt(scene);
    const compiledPrefix=deterministicCharacterOverlay?removeOverlayCharacterSentences(removeTextRiskSentences(prefix)):removeTextRiskSentences(prefix);
    const compiledSuffix=deterministicCharacterOverlay?removeOverlayCharacterSentences(removeTextRiskSentences(suffix)):removeTextRiskSentences(suffix);
    const compositionLock=deterministicCharacterOverlay
      ? [
          "ENVIRONMENT_ONLY_COMPOSITION:",
          "Render an unoccupied environment with a clear empty foreground area reserved for a later graphic overlay.",
          "Use architecture, furniture, objects and financial props only."
        ].join(" ")
      : creativeLockEnabled && !sceneWantsHibou
        ? [
            "OBJECTS_AND_ENVIRONMENT_COMPOSITION:",
            "Render an unoccupied scene and communicate the idea with environment, objects, symbols and composition."
          ].join(" ")
        : creativeLockEnabled
          ? characterLock
          : "";
    const prompt=creativeLockEnabled
      ? [
          compiledPrefix,
          specificVisual,
          styleForImage,
          framingLock,
          compositionLock,
          textFreeLock,
          compiledSuffix
        ].filter(Boolean).join("\n")
      : [prefix,specificVisual,suffix].filter(Boolean).join("\n");
    if(deterministicCharacterOverlay&&/(?:\bhibou\b|\bowl\b|\bbird\b|\banimal\b|\bmascot\b|\bmascotte\b)/iu.test(prompt)){
      fail(`${scene.scene_id}: deterministic background prompt leaked character tokens`);
    }
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
          max_retries:Number(binding.max_retries??1),
          prompt_contract_ref:{
            schema:"HIBOU_PROMPT_CONTRACT_REF_V2",
            contract_sha256:promptContract.contract_sha256,
            global_sha256:promptContract.global_sha256,
            specific_sha256:promptSceneRef.specific_sha256,
            combined_sha256:promptSceneRef.combined_sha256,
            scene_id:String(scene.scene_id)
          }
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
        request,
        fallback_request:fallbackRequest
      });
    }
  }
  return {schema:"HIBOU_IMAGE_PLAN_V1",content_id:contentId,prompt_contract_ref:{schema:"HIBOU_PROMPT_CONTRACT_REF_V2",contract_sha256:promptContract.contract_sha256,global_sha256:promptContract.global_sha256,scene_count:(promptContract.scenes||[]).length},creative_contract_enforced:airtableCreativeContract,creative_routing:{global_style_applied:Boolean(styleLock),global_character_policy_applied:Boolean(characterLock||creative.reference_mode),global_character_policy_applied_in_postproduction:String(creative.reference_mode||"")==="deterministic_character_overlay",global_negative_policy_present:Boolean(negativeLock),global_negative_policy_injected_as_literal_tokens:false,specific_content_brief_present:Boolean(contentBrief),specific_content_brief_copied_into_each_image_prompt:false,scene_image_prompt_preferred:true,visual_idea_used_only_as_fallback:true,background_character_tokens_forbidden:true},scene_count:contract.scenes.length,generation_scene_count:new Set(requests.map(x=>x.scene_id)).size,skipped_full_reuse,candidates_per_scene:candidatesPerScene,production_mode:productionMode,preview_profile_applied:productionMode==="preview"&&Boolean(binding.fallback_profile),request_count:requests.length,requests,size_binding:binding.size,profile:primaryProfile,fallback_profile:fallbackProfile||null,size_binding_repaired:Boolean(binding.size_binding_repaired),profile_migrated:Boolean(binding.profile_migrated),profile_migration:binding.profile_migration||null,fallback_profile_migrated:Boolean(binding.fallback_profile_migrated),hardware_profile_id:binding.hardware_profile_id||null,paid_fallback:false};
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
