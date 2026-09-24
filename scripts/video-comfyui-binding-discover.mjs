#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_HARDWARE_PROFILE = resolve("video/hardware/rog-g814ji-rtx4070-8gb.json");

function fail(message){ throw new Error(message); }
function entries(workflow){
  return Object.entries(workflow||{}).filter(([,node])=>node&&typeof node==="object"&&node.inputs&&node.class_type);
}
function hasInput(node,name){ return Object.prototype.hasOwnProperty.call(node.inputs||{},name); }
function rankPrompt([,node]){
  const c=String(node.class_type||"").toLowerCase();
  let score=0;
  if(c.includes("text")||c.includes("clip")) score+=4;
  if(hasInput(node,"text")) score+=8;
  if(hasInput(node,"prompt")) score+=6;
  return score;
}
function rankSeed([,node]){
  const c=String(node.class_type||"").toLowerCase();
  let score=0;
  if(c.includes("sampler")||c.includes("noise")) score+=4;
  if(hasInput(node,"noise_seed")) score+=10;
  if(hasInput(node,"seed")) score+=8;
  return score;
}
function rankOutput([,node]){
  const c=String(node.class_type||"").toLowerCase();
  let score=0;
  if(c.includes("saveimage")) score+=10;
  if(c.includes("previewimage")) score+=8;
  if(c.includes("image")) score+=2;
  return score;
}
function rankSize([,node]){
  const c=String(node.class_type||"").toLowerCase();
  let score=0;
  if(c.includes("latent")||c.includes("image")) score+=2;
  if(hasInput(node,"width")) score+=6;
  if(hasInput(node,"height")) score+=6;
  if(hasInput(node,"batch_size")) score+=2;
  return score;
}
function best(list,rank){
  return list.map(item=>({item,score:rank(item)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||String(a.item[0]).localeCompare(String(b.item[0])))[0]||null;
}
export function bindingProfiles(hardwareProfile={}) {
  const smoke=hardwareProfile?.image?.smoke_profile || {width:768,height:1344,batch_size:1};
  const fallback=hardwareProfile?.image?.fallback_profile || null;
  return {
    hardware_profile_id:String(hardwareProfile?.profile_id||"").trim()||null,
    profile:{
      width:Number(smoke.width||768),
      height:Number(smoke.height||1344),
      batch_size:Number(smoke.batch_size||1)
    },
    fallback_profile:fallback?{
      width:Number(fallback.width),
      height:Number(fallback.height),
      batch_size:Number(fallback.batch_size||1)
    }:null
  };
}

export function discoverBinding(workflow){
  const nodes=entries(workflow);
  if(!nodes.length) fail("workflow has no API-format nodes");
  const prompt=best(nodes,rankPrompt);
  const seed=best(nodes,rankSeed);
  const size=best(nodes,rankSize);
  const outputs=nodes.map(item=>({item,score:rankOutput(item)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
  const promptInput=prompt && (hasInput(prompt.item[1],"text")?"text":hasInput(prompt.item[1],"prompt")?"prompt":"");
  const seedInput=seed && (hasInput(seed.item[1],"noise_seed")?"noise_seed":hasInput(seed.item[1],"seed")?"seed":"");
  return {
    schema:"HIBOU_COMFYUI_BINDING_DISCOVERY_V1",
    status:prompt&&seed&&outputs.length?"CANDIDATE_REQUIRES_HUMAN_CONFIRMATION":"INCOMPLETE",
    prompt:prompt?{node_id:String(prompt.item[0]),input:promptInput,class_type:prompt.item[1].class_type,score:prompt.score}:null,
    seed:seed?{node_id:String(seed.item[0]),input:seedInput,class_type:seed.item[1].class_type,score:seed.score}:null,
    size:size?{node_id:String(size.item[0]),width_input:"width",height_input:"height",batch_input:hasInput(size.item[1],"batch_size")?"batch_size":null,class_type:size.item[1].class_type,score:size.score}:null,
    output_node_ids:outputs.map(x=>String(x.item[0])),
    output_candidates:outputs.map(x=>({node_id:String(x.item[0]),class_type:x.item[1].class_type,score:x.score})),
    human_confirmation_required:true,
    note:"Heuristic discovery only. Confirm node IDs/inputs against the exported ComfyUI API workflow before generation."
  };
}
if(import.meta.url===`file://${process.argv[1]}`){
  const [workflowPath,outPath]=process.argv.slice(2);
  if(!workflowPath) fail("usage: video-comfyui-binding-discover.mjs workflow-api.json [binding-candidate.json]");
  const workflow=JSON.parse(readFileSync(resolve(workflowPath),"utf8"));
  const result=discoverBinding(workflow);
  let hardwareProfile={};
  try { hardwareProfile=JSON.parse(readFileSync(DEFAULT_HARDWARE_PROFILE,"utf8")); } catch {}
  const profiles=bindingProfiles(hardwareProfile);
  const output={
    workflow_path:resolve(workflowPath),
    endpoint:"http://127.0.0.1:8188",
    prompt:result.prompt,
    seed:result.seed,
    size:result.size,
    hardware_profile_id:profiles.hardware_profile_id,
    profile:profiles.profile,
    fallback_profile:profiles.fallback_profile,
    output_node_ids:result.output_node_ids,
    style_prefix:"",
    style_suffix:"",
    timeout_seconds:900,
    max_retries:1,
    discovery:result
  };
  if(outPath) writeFileSync(resolve(outPath),JSON.stringify(output,null,2));
  process.stdout.write(JSON.stringify(output,null,2)+"\n");
}
