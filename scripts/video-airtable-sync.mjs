#!/usr/bin/env node
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { TABLES, getRecord, queryRecords, updateRecord } from "../lib/airtable.js";

function fail(message){ throw new Error(message); }
function sha(text){ return createHash("sha256").update(String(text)).digest("hex"); }
function norm(text){ return String(text||"").replace(/\s+/g," ").trim(); }
function selectText(value){ return String(value?.name??value??"").trim(); }
function linkedIds(value){
  if(!Array.isArray(value)) return [];
  return value.map(item=>typeof item==="string"?item:item?.id).filter(Boolean);
}
function parseJsonArray(value){
  if(Array.isArray(value)) return value;
  if(!String(value||"").trim()) return [];
  try{ const parsed=JSON.parse(value); return Array.isArray(parsed)?parsed:[]; }catch{return [];}
}
function parseJsonObject(value){
  if(!value) return null;
  try{
    const parsed=JSON.parse(String(value));
    return parsed&&typeof parsed==="object"&&!Array.isArray(parsed)?parsed:null;
  }catch{return null;}
}

function parseJsonArrayStrict(value,label){
  if(Array.isArray(value)) return value;
  const raw=String(value||"").trim();
  if(!raw) return [];
  let parsed;
  try{ parsed=JSON.parse(raw); }
  catch(error){ fail(`${label} contains invalid JSON: ${error?.message||error}`); }
  if(!Array.isArray(parsed)) fail(`${label} must be a JSON array`);
  return parsed;
}

function parseJsonObjectStrict(value,label){
  if(value&&typeof value==="object"&&!Array.isArray(value)) return value;
  const raw=String(value||"").trim();
  if(!raw) return null;
  let parsed;
  try{ parsed=JSON.parse(raw); }
  catch(error){ fail(`${label} contains invalid JSON: ${error?.message||error}`); }
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed)) fail(`${label} must be a JSON object`);
  return parsed;
}

export async function resolveCanonicalVideoProfile(contentRecord){
  const linked=linkedIds(contentRecord?.fields?.["Profil vidéo"]);
  if(linked.length) return getRecord(TABLES.videoProfiles,linked[0]);

  const active=await queryRecords(TABLES.videoProfiles,{
    filterByFormula:"AND({Actif}=1,{Profil}='HIBOU_VIRAL_V1')",
    pageSize:5
  });
  if(active.length!==1){
    fail(`expected exactly one active canonical HIBOU_VIRAL_V1 profile, got ${active.length}`);
  }
  return active[0];
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
    if(!Number.isFinite(duration)||duration<1.5||duration>12) fail(`${f.Scène||record.id}: duration must be 1.5..12 s`);
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
      visual_group:String(f["Groupe visuel"]||"").trim()||null,
      asset_requirements:parseJsonArrayStrict(
        f["Exigences assets JSON"],
        `${f.Scène||record.id}: Exigences assets JSON`
      ),
      breath_unit:String(f["Unité de souffle"]||f.Narration||""),
      voice:{
        target_wpm:Number(f["Débit cible voix (mpm)"]||0)||null,
        relative_speed_pct:Number(f["Vitesse relative voix %"]||100),
        pause_after_ms:Number(f["Pause après (ms)"]||0),
        emphasis:String(f["Accentuation voix"]||""),
        intent:String(f["Intention voix"]||""),
        verbatim:true,
        prosody_cues:parseJsonArrayStrict(
          f["Prosodie JSON"],
          `${f.Scène||record.id}: Prosodie JSON`
        )
      },
      timeline:parseJsonObjectStrict(
        f["Timeline JSON"],
        `${f.Scène||record.id}: Timeline JSON`
      ),
      pose_request:String(f["Pose Hibou"]||""),
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
      profile_version:String(profile.Version||"HIBOU_VIRAL_V1@2.4-V4.2"),
      method_version:"VIDEO_METHOD_V4.3",
      source:"airtable",
      exported_at:new Date().toISOString()
    },
    features:{
      video_timeline_v1:Boolean(profile["Timeline intra-scène V1"]),
      video_creative_qc_v1:Boolean(profile["QC créatif V1"]),
      video_pose_registry_v1:Boolean(profile["Registry poses V1"]),
      video_prosody_v1:Boolean(profile["Prosodie V1"]),
      video_music_mix_v1:Boolean(profile["Mix musique V1"]),
      video_incremental_retouch_v1:Boolean(profile["Retouches incrémentales V1"]),
      video_human_candidate_selection_v1:Boolean(profile["Sélection humaine candidats V1"]),
      video_prompt_graph_v1:Boolean(profile["Prompt Graph V1"])
    },
    creative:{
      profile_name:String(profile.Profil||"HIBOU_VIRAL_V1"),
      description:String(profile.Description||""),
      style_lock:String(profile["Style lock"]||""),
      negative_prompt:String(profile["Negative prompt"]||""),
      character_lock:String(profile["Character lock Hibou"]||""),
      movement_profile:selectText(profile["Profil mouvement"])||null,
      curve_profile:selectText(profile["Courbe cadence"])||null,
      content_brief:String(content["Prompt / consignes"]||""),
      reference_image_url:String(process.env.HIBOU_REFERENCE_IMAGE_URL||""),
      reference_asset_repo_path:"video/assets/hibou-canonical-512.webp.b64",
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
        scene_duration_target_s:[Number(profile["Durée min scène"]||2.8),Number(profile["Durée max scène"]||5)],
        scene_duration_allowed_s:[1.5,12],
        cadence:"intonation-adaptive",
        perceptible_beat_s:[2,3],
        full_composition_change_s:[3,5]
      },
      creative_qc:{
        model:String(profile["Modèle QC créatif"]||"openai/clip-vit-base-patch32"),
        block_on_reject:Boolean(profile["QC créatif bloquant"]),
        thresholds:parseJsonObject(profile["Seuils QC créatif JSON"])||{}
      },
      production_defaults:{
        plans_min:Number(profile["Plans min"]||10),
        plans_max:Number(profile["Plans max"]||16),
        candidates_per_scene:Number(profile["Candidats par scène"]||2),
        image_qc_threshold:Number(profile["Seuil QC image"]||85),
        zoom_min_pct:Number(profile["Zoom min %"]||1.5),
        zoom_max_pct:Number(profile["Zoom max %"]||3.5)
      }
    },
    engine:{
      renderer:"ffmpeg",
      renderer_version:"video-local-render-v1",
      fps:30,
      width:1080,
      height:1920,
      preset:"medium",
      preview_preset:"veryfast",
      crf:18,
      preview_crf:23
    },
    production:{
      mode:String(profile["Mode production par défaut"]?.name||profile["Mode production par défaut"]||"final").trim().toLowerCase(),
      final_candidates_per_scene:Number(profile["Candidats par scène"]||3),
      preview_candidates_per_scene:1
    },
    scenes,
    audio:{
      status:"pending",
      engine:"chatterbox_multilingual",
      reference:null,
      density_profile:selectText(profile["Profil densité voix"])||null,
      density_profile_runtime_applied:false
    },
    music:{
      status:Boolean(profile["Musique activée"])?"configured":"none_commercial",
      enabled:Boolean(profile["Musique activée"]),
      reference:String(profile["Piste musique locale"]||""),
      license:String(profile["Licence musique"]||""),
      license_evidence:String(profile["Preuve licence musique"]||""),
      level_db:Number(profile["Niveau musique dB"]||-24),
      duck_threshold:Number(profile["Ducking seuil"]||0.025),
      duck_ratio:Number(profile["Ducking ratio"]||8),
      fade_in_s:Number(profile["Musique fade-in s"]||0.8),
      fade_out_s:Number(profile["Musique fade-out s"]||1.2),
      policy:"GLOBAL only; master sans morceau commercial non maîtrisé"
    },
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
  const profile=await resolveCanonicalVideoProfile(content);
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
