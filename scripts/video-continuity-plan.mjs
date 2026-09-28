#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const CONTINUITY_SCHEMA = "HIBOU_VISUAL_CONTINUITY_PLAN_V1";

function fail(message){ throw new Error(message); }
function text(value){ return String(value ?? "").trim(); }
function sha256(value){
  return createHash("sha256").update(String(value),"utf8").digest("hex");
}
function stable(value){
  if(Array.isArray(value)) return value.map(stable);
  if(!value || typeof value!=="object") return value;
  return Object.fromEntries(
    Object.keys(value).sort().map(key=>[key,stable(value[key])])
  );
}
function stableJson(value){ return JSON.stringify(stable(value)); }

function normalizedRequirements(scene){
  const raw=Array.isArray(scene?.asset_requirements)?scene.asset_requirements:[];
  const normalized=raw.map((req,index)=>{
    if(!req || typeof req!=="object" || Array.isArray(req)){
      fail(`${scene.scene_id}: asset requirement ${index+1} must be an object`);
    }
    const slot=text(req.slot);
    const kind=text(req.kind);
    if(!slot || !kind){
      fail(`${scene.scene_id}: asset requirement ${index+1} needs slot and kind`);
    }
    return {
      slot,
      kind,
      required_tags:Array.isArray(req.required_tags)
        ? req.required_tags.map(text).filter(Boolean)
        : [],
      optional_tags:Array.isArray(req.optional_tags)
        ? req.optional_tags.map(text).filter(Boolean)
        : [],
      scene_type:text(req.scene_type)||null,
    };
  });
  const seenSlots=new Set();
  for(const req of normalized){
    if(seenSlots.has(req.slot)){
      fail(`${scene.scene_id}: duplicate asset requirement slot ${req.slot}`);
    }
    seenSlots.add(req.slot);
  }
  return normalized;
}

export function buildContinuityPlan(contract){
  if(contract?.contract_version!=="HIBOU_VIDEO_CONTRACT_V1"){
    fail("HIBOU_VIDEO_CONTRACT_V1 required");
  }
  const scenes=Array.isArray(contract.scenes)?contract.scenes:[];
  if(!scenes.length) fail("at least one scene required");

  const ordered=[...scenes].sort((a,b)=>Number(a.order)-Number(b.order));
  const seenIds=new Set();
  for(let index=0;index<ordered.length;index+=1){
    const scene=ordered[index];
    const id=text(scene?.scene_id);
    if(!id || seenIds.has(id)) fail("scene ids must be unique and non-empty");
    seenIds.add(id);
    if(Number(scene.order)!==index+1){
      fail(`${id}: scene order must be contiguous`);
    }
  }

  const groups=new Map();
  for(const scene of ordered){
    const group=text(scene.visual_group);
    if(!group) continue;
    if(!groups.has(group)) groups.set(group,[]);
    groups.get(group).push(scene);
  }

  const warnings=[];
  const groupPlans=[];
  for(const [groupId,members] of [...groups.entries()].sort(([a],[b])=>a.localeCompare(b))){
    const sorted=[...members].sort((a,b)=>Number(a.order)-Number(b.order));
    const orders=sorted.map(scene=>Number(scene.order));
    const contiguous=orders.every((value,index)=>index===0 || value===orders[index-1]+1);
    if(!contiguous){
      warnings.push({
        code:"visual_group_non_contiguous",
        visual_group:groupId,
        scene_ids:sorted.map(scene=>scene.scene_id),
      });
    }
    if(sorted.length===1){
      warnings.push({
        code:"single_scene_visual_group",
        visual_group:groupId,
        scene_id:sorted[0].scene_id,
      });
    }

    const base=sorted[0];
    const basePrompt=text(base.image_prompt)||text(base.visual_idea);
    if(!basePrompt) fail(`${base.scene_id}: visual group base needs image_prompt or visual_idea`);

    const groupCore={
      visual_group:groupId,
      base_scene_id:base.scene_id,
      scene_ids:sorted.map(scene=>scene.scene_id),
      scene_orders:orders,
      contiguous,
      base_visual_sha256:sha256(basePrompt),
      base_generation_count:1,
      planned_background_reuses:Math.max(0,sorted.length-1),
      policy:{
        preserve_background:true,
        preserve_environment:true,
        preserve_lighting:true,
        allow_pose_delta:true,
        allow_prop_delta:true,
        allow_caption_delta:true,
        allow_micro_motion_delta:true,
        regenerate_background_only_on_explicit_group_change:true,
      },
    };
    groupPlans.push({
      ...groupCore,
      group_fingerprint_sha256:sha256(stableJson(groupCore)),
    });
  }

  const baseByGroup=new Map(groupPlans.map(group=>[group.visual_group,group.base_scene_id]));
  const scenesPlan=ordered.map(scene=>{
    const group=text(scene.visual_group)||null;
    const requirements=normalizedRequirements(scene);
    const mode=!group
      ? "INDEPENDENT"
      : baseByGroup.get(group)===scene.scene_id
        ? "BASE_GENERATION"
        : "REUSE_GROUP_BASE";
    return {
      scene_id:scene.scene_id,
      order:Number(scene.order),
      visual_group:group,
      mode,
      base_scene_id:group?baseByGroup.get(group):null,
      pose_request:text(scene.pose_request)||null,
      screen_text:text(scene.screen_text)||null,
      asset_requirements:requirements,
      asset_requirement_count:requirements.length,
      image_prompt_sha256:text(scene.image_prompt)
        ? sha256(text(scene.image_prompt))
        : null,
      visual_idea_sha256:text(scene.visual_idea)
        ? sha256(text(scene.visual_idea))
        : null,
    };
  });

  const groupedSceneCount=scenesPlan.filter(scene=>scene.visual_group).length;
  const independentSceneCount=scenesPlan.length-groupedSceneCount;
  const backgroundReuseCount=scenesPlan.filter(scene=>scene.mode==="REUSE_GROUP_BASE").length;
  const groupBaseGenerationCount=groupPlans.length;
  const totalBackgroundGenerationCount=groupBaseGenerationCount+independentSceneCount;
  const planCore={
    schema:CONTINUITY_SCHEMA,
    content_id:text(contract?.content?.content_id)||null,
    profile_name:text(contract?.creative?.profile_name)||null,
    scene_count:scenesPlan.length,
    grouped_scene_count:groupedSceneCount,
    independent_scene_count:independentSceneCount,
    visual_group_count:groupPlans.length,
    planned_group_base_generations:groupBaseGenerationCount,
    planned_independent_background_generations:independentSceneCount,
    planned_background_generations:totalBackgroundGenerationCount,
    planned_background_reuses:backgroundReuseCount,
    theoretical_background_generation_reduction:backgroundReuseCount,
    groups:groupPlans,
    scenes:scenesPlan,
    warnings,
    policy:{
      planning_only:true,
      execution_performed:false,
      gpu_execution_performed:false,
      contract_mutation_performed:false,
      publication_authorized:false,
      visual_group_must_be_explicit:true,
      no_prompt_text_heuristics:true,
    },
  };

  return {
    ...planCore,
    continuity_plan_sha256:sha256(stableJson(planCore)),
  };
}

if(import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [input,output]=process.argv.slice(2);
  if(!input||!output){
    fail("usage: node scripts/video-continuity-plan.mjs storyboard.json continuity-plan.json");
  }
  const contract=JSON.parse(readFileSync(resolve(input),"utf8"));
  const plan=buildContinuityPlan(contract);
  writeFileSync(resolve(output),JSON.stringify(plan,null,2)+"\n","utf8");
  process.stdout.write(JSON.stringify({
    ok:true,
    schema:plan.schema,
    output:resolve(output),
    visual_group_count:plan.visual_group_count,
    planned_background_reuses:plan.planned_background_reuses,
    continuity_plan_sha256:plan.continuity_plan_sha256,
  })+"\n");
}
