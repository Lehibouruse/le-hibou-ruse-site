#!/usr/bin/env node
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { TABLES, getRecord, updateRecord } from "../lib/airtable.js";

function fail(message){ throw new Error(message); }
function sha(text){ return createHash("sha256").update(String(text)).digest("hex"); }
function norm(text){ return String(text||"").replace(/\s+/g," ").trim(); }
function linkedIds(value){
  if(!Array.isArray(value)) return [];
  return value.map(item=>typeof item==="string"?item:item?.id).filter(Boolean);
}
function parseJsonArray(value){
  if(Array.isArray(value)) return value;
  if(!String(value||"").trim()) return [];
  try{ const parsed=JSON.parse(value); return Array.isArray(parsed)?parsed:[]; }catch{return [];}
}

export function buildStoryboardContract(contentRecord, sceneRecords, profileRecord=null){
  const content=contentRecord?.fields||{};
  const profile=profileRecord?.fields||{};
  const ordered=[...sceneRecords].sort((a,b)=>Number(a.fields?.Ordre||0)-Number(b.fields?.Ordre||0));
  if(ordered.length<8||ordered.length>18) fail(`scene_count must be 8..18, got ${ordered.length}`);
  const script=norm(content.Script);
  if(!script) fail("Content Pipeline Script is empty");
  const reconstructed=norm(ordered.map(r=>r.fields?.Narration||"").join(" "));
  if(reconstructed!==script) fail("scene narration does not reconstruct Content Pipeline Script exactly after whitespace normalization");
  const scriptHash=sha(reconstructed);

  let total=0;
  const scenes=ordered.map((record,index)=>{
    const f=record.fields||{};
    const order=Number(f.Ordre);
    if(order!==index+1) fail("scene order must be contiguous");
    const duration=Number(f["Durée secondes"]);
    if(!Number.isFinite(duration)||duration<2.5||duration>5.5) fail(`${f.Scène||record.id}: duration must be 2.5..5.5 s`);
    total+=duration;
    const candidates=parseJsonArray(f["Candidats JSON"]);
    return {
      scene_id:String(f.Scène||record.id),
      source_scene_record_id:record.id,
      order,
      narration_exact:{mode:"text_reference",text:String(f.Narration||""),script_sha256:scriptHash},
      visual_idea:String(f["Idée visuelle"]||""),
      image_prompt:String(f["Prompt image"]||""),
      screen_text:String(f["Texte écran"]||""),
      planned_duration_s:duration,
      measured_duration_s:null,
      zoom_percent:Number(f["Zoom %"]||3),
      framing:{type:f["Type de plan"]?.name||f["Type de plan"]||"",anchor:f.Ancrage?.name||f.Ancrage||"",hibou:Boolean(f.Hibou)},
      image:{candidates,selected:null,selection_reason:null},
      breath_unit:String(f["Unité de souffle"]||f.Narration||""),
      voice:{
        target_wpm:Number(f["Débit cible voix (mpm)"]||0)||null,
        relative_speed_pct:Number(f["Vitesse relative voix %"]||100),
        pause_after_ms:Number(f["Pause après (ms)"]||0),
        emphasis:String(f["Accentuation voix"]||""),
        intent:String(f["Intention voix"]||"")
      },
      music_cue:String(f["Cue musique"]||"")
    };
  });

  return {
    contract_version:"HIBOU_VIDEO_CONTRACT_V1",
    contract_state:"storyboard",
    content:{
      content_id:contentRecord.id,
      title:String(content.Sujet||""),
      script_version:Number(content["Version script"]||1),
      profile_version:String(profile.Version||"HIBOU_VIRAL_V1@2.3-V4.1"),
      method_version:"VIDEO_METHOD_V4",
      source:"airtable",
      exported_at:new Date().toISOString()
    },
    creative:{
      profile_name:String(profile.Profil||"HIBOU_VIRAL_V1"),
      description:String(profile.Description||""),
      style_lock:String(profile["Style lock"]||""),
      negative_prompt:String(profile["Negative prompt"]||""),
      character_lock:String(profile["Character lock Hibou"]||""),
      content_brief:String(content["Prompt / consignes"]||""),
      reference_image_url:String(process.env.HIBOU_REFERENCE_IMAGE_URL||"https://le-hibou-ruse-site.vercel.app/hibou-monocle.webp"),
      reference_mode:"deterministic_character_overlay",
      language:"fr",
      text_in_generated_images:false,
      branding:{
        text:"Le Hibou Rusé",
        position:"bottom-center",
        size:"small",
        color:"ink",
        source:"post-production"
      },
      pacing:{
        scene_duration_target_s:[2.5,4.5],
        scene_duration_allowed_s:[2.5,5.5],
        cadence:"intonation-adaptive"
      }
    },
    engine:{renderer:"ffmpeg",renderer_version:"video-local-render-v1",fps:30,width:1080,height:1920,preset:"medium"},
    scenes,
    audio:{status:"pending",engine:"chatterbox_multilingual",reference:null},
    music:{status:"none_commercial",policy:"master sans morceau commercial ; cues seulement"},
    subtitles:{status:"pending",source:"exact narration text"},
    qc:{status:"TIMING_PASS_MEDIA_NOT_RUN",technical:{planned_duration_s:Number(total.toFixed(3)),scene_count:scenes.length}},
    validation:{human_required:true,publication_authorized:false,status:"STORYBOARD_READY"}
  };
}

export function buildContentResultFields(result, manifestRef=""){
  const technical=result?.qc?.technical||{};
  const pass=result?.qc?.status==="PASS";
  const error=result?.error||(!pass&&result?.qc?.status&&result.qc.status!=="PENDING_RENDER"?`QC status: ${result.qc.status}`:"");
  const registry={
    schema:"HIBOU_LOCAL_VIDEO_RESULT_V1",
    manifest_ref:manifestRef||null,
    contract_version:result?.contract_version||null,
    renderer_version:result?.engine?.renderer_version||technical?.renderer_version||null,
    master_sha256:technical?.sha256||null,
    size_bytes:technical?.size_bytes??null,
    duration_s:technical?.duration_s??null,
    scene_count:Array.isArray(result?.scenes)?result.scenes.length:null,
    local_only:true,
    durable_upload_pending:true,
    reported_at:new Date().toISOString()
  };
  const fields={
    "État production vidéo":pass?"TECHNICAL_RENDER_PASS — HUMAN_REVIEW_REQUIRED":(error?"TECHNICAL_RENDER_ERROR":"TECHNICAL_RESULT_RECORDED"),
    "Erreur pipeline":String(error||""),
    "Assets":JSON.stringify(registry,null,2),
    "Version pipeline vidéo":`${result?.contract_version||"unknown"} / ${result?.engine?.renderer_version||"unknown"}`
  };
  if(Number.isFinite(Number(technical?.duration_s))) fields["Durée secondes"]=Number(technical.duration_s);
  return fields;
}

export function buildSceneResultFields(scene){
  const artifact=scene?.render_artifact||{};
  const parts=[];
  if(artifact.sha256) parts.push(`render_sha256=${artifact.sha256}`);
  if(scene?.measured_duration_s!=null) parts.push(`measured_duration_s=${scene.measured_duration_s}`);
  if(scene?.image?.selected_sha256) parts.push(`selected_image_sha256=${scene.image.selected_sha256}`);
  if(parts.length) parts.push("local-only evidence; durable upload pending");
  return {
    "Motif QC":parts.join("; "),
    "Erreur":String(scene?.error||"")
  };
}

export async function exportFromAirtable(contentId, outputPath){
  const content=await getRecord(TABLES.content,contentId);
  const ids=linkedIds(content.fields?.["Scènes vidéo"]);
  if(!ids.length) fail("Content Pipeline record has no linked Scènes vidéo");
  const scenes=[];
  for(const id of ids) scenes.push(await getRecord(TABLES.videoScenes,id));
  const profileIds=linkedIds(content.fields?.["Profil vidéo"]);
  const profile=profileIds.length?await getRecord(TABLES.videoProfiles,profileIds[0]):null;
  const contract=buildStoryboardContract(content,scenes,profile);
  mkdirSync(dirname(resolve(outputPath)),{recursive:true});
  writeFileSync(resolve(outputPath),JSON.stringify(contract,null,2));
  return contract;
}

export async function reportResult(contentId, resultPath, {dryRun=false}={}){
  const result=JSON.parse(readFileSync(resolve(resultPath),"utf8"));
  const contentFields=buildContentResultFields(result,resultPath);
  const sceneUpdates=(result.scenes||[])
    .filter(scene=>scene.source_scene_record_id)
    .map(scene=>({id:scene.source_scene_record_id,fields:buildSceneResultFields(scene)}));
  if(!dryRun){
    await updateRecord(TABLES.content,contentId,contentFields);
    for(const item of sceneUpdates) await updateRecord(TABLES.videoScenes,item.id,item.fields);
  }
  return {content_id:contentId,content_fields:contentFields,scene_updates:sceneUpdates,dry_run:dryRun};
}

export async function reportError(contentId, message, {dryRun=false}={}){
  const fields={"État production vidéo":"LOCAL_PIPELINE_ERROR","Erreur pipeline":String(message||"unknown local pipeline error").slice(0,10000)};
  if(!dryRun) await updateRecord(TABLES.content,contentId,fields);
  return {content_id:contentId,fields,dry_run:dryRun};
}

if(import.meta.url===`file://${process.argv[1]}`){
  const [command,a,b,...rest]=process.argv.slice(2);
  const dryRun=rest.includes("--dry-run")||b==="--dry-run";
  if(command==="export"){
    if(!a||!b) fail("usage: video-airtable-sync.mjs export <content-record-id> <output.json>");
    const result=await exportFromAirtable(a,b);
    process.stdout.write(JSON.stringify({ok:true,content_id:a,scene_count:result.scenes.length,output:resolve(b)})+"\n");
  }else if(command==="report"){
    if(!a||!b) fail("usage: video-airtable-sync.mjs report <content-record-id> <manifest.json> [--dry-run]");
    process.stdout.write(JSON.stringify(await reportResult(a,b,{dryRun}))+"\n");
  }else if(command==="report-error"){
    if(!a||!b) fail("usage: video-airtable-sync.mjs report-error <content-record-id> <message> [--dry-run]");
    process.stdout.write(JSON.stringify(await reportError(a,b,{dryRun}))+"\n");
  }else fail("command must be export, report or report-error");
}
