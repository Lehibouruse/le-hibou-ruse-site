#!/usr/bin/env node
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { TABLES, getRecord, queryRecords, updateRecord } from "../lib/airtable.js";

function fail(message){ throw new Error(message); }
function sha(text){ return createHash("sha256").update(String(text)).digest("hex"); }
function stableValue(value){
  if(Array.isArray(value)) return value.map(stableValue);
  if(value===null||typeof value!=="object") return value;
  return Object.fromEntries(Object.keys(value).sort().map(key=>[key,stableValue(value[key])]));
}
function shaObject(value){ return sha(JSON.stringify(stableValue(value))); }
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
function parseCandidateSource(value){
  const array=parseJsonArray(value);
  if(array.length||Array.isArray(value)) return {candidates:array,source_selected_path:null};
  const object=parseJsonObject(value);
  return {
    candidates:Array.isArray(object?.candidates)?object.candidates:[],
    source_selected_path:String(object?.selected_path||"").trim()||null
  };
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
  if(!parsed||typeof parsed!=="object"||Array.isArray(parsed)){
    fail(`${label} must be a JSON object`);
  }
  return parsed;
}

export function parseSpecificV2SceneAddenda(brief){
  const raw=String(brief||"");
  const marker=/ADDITIF\s+SP[ÉE]CIFIQUE\s+V2\b/i.exec(raw);
  if(!marker) return new Map();
  const addenda=new Map();
  let number=null;
  let lines=[];
  function flush(){
    if(number===null) return;
    const instruction=lines.join(" ").trim();
    if(!instruction) fail(`specific V2 scene ${number} has no instruction`);
    if(addenda.has(number)) fail(`specific V2 scene ${number} is duplicated`);
    addenda.set(number,instruction);
  }
  for(const line of raw.slice(marker.index+marker[0].length).split(/\r?\n/)){
    const trimmed=line.trim();
    const scene=/^SC[ÈE]NE\s+(\d+)\s*[—–-]\s*(.*)$/i.exec(trimmed);
    if(scene){
      flush();
      number=Number(scene[1]);
      lines=[scene[2]];
      continue;
    }
    if(/^R[ÈE]GLE\s+DE\s+QUALIT[ÉE]\s*:/i.test(trimmed)) break;
    if(number!==null&&trimmed) lines.push(trimmed);
  }
  flush();
  if(!addenda.size) fail("ADDITIF SPÉCIFIQUE V2 contains no SCÈNE instructions");
  return addenda;
}

function sourceProjection(contract){
  const content=contract?.content||{};
  const creative=contract?.creative||{};
  const audio=contract?.audio||{};
  const music=contract?.music||{};
  return {
    global:{
      profile_record_id:content.profile_record_id||null,
      profile_version:content.profile_version||"",
      method_version:content.method_version||"",
      profile_name:creative.profile_name||"",
      description:creative.description||"",
      style_lock:creative.style_lock||"",
      negative_prompt:creative.negative_prompt||"",
      character_lock:creative.character_lock||"",
      movement_profile:creative.movement_profile||null,
      curve_profile:creative.curve_profile||null,
      pacing:creative.pacing||null,
      creative_qc:creative.creative_qc||null,
      production_defaults:creative.production_defaults||null,
      voice_profile_id:audio.voice_profile_id||"",
      voice_profile_text:audio.voice_profile_text||"",
      density_profile:audio.density_profile||null,
      music_policy_text:music.source_policy_text||"",
      music_enabled:music.enabled===true,
      music_reference:music.reference||"",
      music_license:music.license||"",
      music_license_evidence:music.license_evidence||"",
      music_level_db:music.level_db??null,
      music_duck_threshold:music.duck_threshold??null,
      music_duck_ratio:music.duck_ratio??null,
      music_fade_in_s:music.fade_in_s??null,
      music_fade_out_s:music.fade_out_s??null,
      features:contract?.features||null,
      default_mode:content.source_default_production_mode||"",
      final_candidates_per_scene:contract?.production?.final_candidates_per_scene??null
    },
    specific:{
      content_id:content.content_id||"",
      title:content.title||"",
      script_version:content.script_version??null,
      content_brief:creative.content_brief||""
    },
    scenes:(contract?.scenes||[]).map(scene=>({
      source_scene_record_id:scene.source_scene_record_id||"",
      scene_id:scene.scene_id||"",
      order:scene.order??null,
      narration_exact:scene.narration_exact?.text||"",
      visual_idea:scene.visual_idea||"",
      image_prompt:scene.image_prompt||"",
      screen_text:scene.screen_text||"",
      planned_duration_s:scene.planned_duration_s??null,
      zoom_percent:scene.zoom_percent??null,
      framing:scene.framing||null,
      breath_unit:scene.breath_unit||"",
      voice:scene.voice||null,
      visual_group:scene.visual_group||null,
      persona_case:scene.persona_case||null,
      qualify:scene.qualify||null,
      disqualify:scene.disqualify||null,
      condition:scene.condition||null,
      risk:scene.risk||null,
      source_label:scene.source_label||null,
      jurisdiction:scene.jurisdiction||null,
      as_of_date:scene.as_of_date||null,
      timeline:scene.timeline||null,
      image_candidates:scene.image?.candidates||[],
      image_source_selected_path:scene.image?.source_selected_path||null,
      pose_request:scene.pose_request||"",
      music_cue:scene.music_cue||"",
      asset_requirements:scene.asset_requirements||[]
    }))
  };
}

function sourceFingerprints(contract){
  const projection=sourceProjection(contract);
  return {
    schema:"HIBOU_AIRTABLE_SOURCE_FRESHNESS_V1",
    global_sha256:shaObject(projection.global),
    specific_sha256:shaObject(projection.specific),
    scenes_sha256:shaObject(projection.scenes),
    content_brief_sha256:sha(projection.specific.content_brief),
    scene_count:projection.scenes.length
  };
}

function validateAirtableSourceRecords(contentId,content,profile,scenes){
  if(content?.id!==contentId||!content.fields) fail("Airtable Content Pipeline source unavailable");
  const sceneIds=linkedIds(content.fields["Scènes vidéo"]);
  if(!sceneIds.length||new Set(sceneIds).size!==sceneIds.length){
    fail("Airtable Content Pipeline linked scenes missing or duplicated");
  }
  const profileIds=linkedIds(content.fields["Profil vidéo"]);
  if(profileIds.length!==1) fail("Airtable Content Pipeline must link exactly one video profile");
  if(profile?.id!==profileIds[0]||!profile.fields||profile.fields.Actif!==true){
    fail("Airtable video profile unavailable or inactive");
  }
  for(const name of ["Profil","Version","Description","Style lock","Negative prompt","Character lock Hibou","Voix","Politique musique"]){
    if(!String(profile.fields[name]||"").trim()) fail(`Airtable video profile missing ${name}`);
  }
  if(!String(content.fields["Prompt / consignes"]||"").trim()){
    fail("Airtable Content Pipeline missing Prompt / consignes");
  }
  if(!Array.isArray(scenes)||scenes.length!==sceneIds.length){
    fail("Airtable video scene source count mismatch");
  }
  const byId=new Map(scenes.map(scene=>[scene?.id,scene]));
  if(byId.size!==sceneIds.length) fail("Airtable video scene source duplicated");
  for(const id of sceneIds){
    if(!byId.get(id)?.fields) fail("Airtable video scene source unavailable");
  }
  return {profileId:profileIds[0],scenes:sceneIds.map(id=>byId.get(id))};
}

function compareAirtableStoryboardSource(contract,content,profile,scenes,sourceDetails){
  if(contract?.content?.source!=="airtable") fail("Airtable freshness requires content.source=airtable");
  const contentId=String(contract?.content?.content_id||"").trim();
  if(!/^rec[A-Za-z0-9]{14}$/.test(contentId)) fail("Airtable storyboard content_id missing or invalid");
  const validated=validateAirtableSourceRecords(contentId,content,profile,scenes);
  const fresh=buildStoryboardContract(content,validated.scenes,profile);
  const full=sourceFingerprints(fresh);
  const scope=contract?.render_scope;
  let scopedFresh=fresh;
  if(scope){
    const sceneIds=(contract.scenes||[]).map(scene=>String(scene?.scene_id||""));
    const expectedIds=fresh.scenes.slice(0,sceneIds.length).map(scene=>scene.scene_id);
    const count=Number(scope.render_scene_count);
    const original=Number(scope.original_scene_count);
    const limit=Number(scope.max_scenes);
    if(scope.schema!=="HIBOU_VIDEO_RENDER_SCOPE_V1"||
       !["preview","final"].includes(String(scope.mode||""))||
       !Number.isInteger(count)||count<1||count!==sceneIds.length||
       !Number.isInteger(original)||original!==fresh.scenes.length||
       !Number.isInteger(limit)||limit<1||limit>25||
       count!==Math.min(original,limit)||
       scope.partial!==(count<original)||
       JSON.stringify(scope.scene_ids)!==JSON.stringify(sceneIds)||
       JSON.stringify(sceneIds)!==JSON.stringify(expectedIds)){
      fail("Airtable storyboard render scope does not match full source prefix");
    }
    scopedFresh={...fresh,scenes:fresh.scenes.slice(0,count)};
  }else if((contract.scenes||[]).length!==fresh.scenes.length){
    fail("Airtable storyboard missing full render scope metadata");
  }
  const expected=sourceFingerprints(scopedFresh);
  const actual=sourceFingerprints(contract);
  if(contract?.creative?.content_brief_sha256&&
     contract.creative.content_brief_sha256!==actual.content_brief_sha256){
    fail("Airtable storyboard local content_brief hash mismatch");
  }
  if(contract?.content?.source_fingerprints){
    for(const key of ["global_sha256","specific_sha256","scenes_sha256"]){
      if(contract.content.source_fingerprints[key]!==
         (scope?.partial?full[key]:actual[key])){
        fail(`Airtable storyboard local ${key} hash mismatch`);
      }
    }
  }
  const changed=["global_sha256","specific_sha256","scenes_sha256"]
    .filter(key=>actual[key]!==expected[key]);
  if(changed.length) fail(`Airtable storyboard source drift: ${changed.join(", ")}`);
  return {
    ...expected,
    pass:true,
    ...sourceDetails,
    content_id:contentId,
    profile_record_id:profile.id,
    checked_at:new Date().toISOString()
  };
}

export async function verifyAirtableStoryboardFreshness(contract,{loadRecord=getRecord}={}){
  if(contract?.content?.source!=="airtable") fail("Airtable freshness requires content.source=airtable");
  const contentId=String(contract?.content?.content_id||"").trim();
  if(!/^rec[A-Za-z0-9]{14}$/.test(contentId)) fail("Airtable storyboard content_id missing or invalid");
  const content=await loadRecord(TABLES.content,contentId);
  const sceneIds=linkedIds(content?.fields?.["Scènes vidéo"]);
  const profileIds=linkedIds(content?.fields?.["Profil vidéo"]);
  if(profileIds.length!==1||!sceneIds.length) fail("Airtable Content Pipeline links unavailable");
  const [profile,...scenes]=await Promise.all([
    loadRecord(TABLES.videoProfiles,profileIds[0]),
    ...sceneIds.map(id=>loadRecord(TABLES.videoScenes,id))
  ]);
  return compareAirtableStoryboardSource(contract,content,profile,scenes,{
    source:"airtable_live",
    live_at_run:true
  });
}

export function verifyAirtableStoryboardSnapshot(contract,snapshot,{now=Date.now()}={}){
  if(snapshot?.schema!=="HIBOU_AIRTABLE_SOURCE_SNAPSHOT_V1"||
     !["codex_airtable_connector","server_airtable_live"].includes(snapshot.capture_method)||
     snapshot.base_id!=="appWyUX7TYPNrDbyP"){
    fail("Airtable source snapshot schema, capture method or base invalid");
  }
  const capturedMs=Date.parse(snapshot.captured_at);
  const nowMs=now instanceof Date?now.getTime():Number(now);
  if(!Number.isFinite(capturedMs)||!Number.isFinite(nowMs)||
     nowMs-capturedMs>3_600_000||nowMs-capturedMs< -60_000){
    fail("Airtable source snapshot expired or clock invalid (maximum 1 hour)");
  }
  const contentId=String(contract?.content?.content_id||"");
  if(snapshot.content_id!==contentId||snapshot.profile_record_id!==snapshot.profile?.id){
    fail("Airtable source snapshot content or profile identity mismatch");
  }
  return compareAirtableStoryboardSource(
    contract,snapshot.content,snapshot.profile,snapshot.scenes,{
      source:snapshot.capture_method==="server_airtable_live"?"airtable_server_snapshot":"airtable_connector_snapshot",
      live_at_run:false,
      captured_at:snapshot.captured_at,
      maximum_age_ms:3_600_000
    }
  );
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
  const specificV2Addenda=parseSpecificV2SceneAddenda(content["Prompt / consignes"]);
  const sceneOrders=new Set(ordered.map(record=>Number(record.fields?.Ordre)));
  for(const order of specificV2Addenda.keys()){
    if(!sceneOrders.has(order)) fail(`specific V2 scene ${order} has no linked Scènes vidéo record`);
  }

  let total=0;
  const scenes=ordered.map((record,index)=>{
    const f=record.fields||{};
    const order=Number(f.Ordre);
    if(order!==index+1) fail("scene order must be contiguous");
    const duration=Number(f["Durée secondes"]);
    if(!Number.isFinite(duration)||duration<1.5||duration>12) fail(`${f.Scène||record.id}: duration must be 1.5..12 s`);
    total+=duration;
    const candidateSource=parseCandidateSource(f["Candidats JSON"]);
    const specificV2Instruction=specificV2Addenda.get(order);
    const visualIdea=String(f["Idée visuelle"]||"");
    return {
      scene_id:String(f.Scène||record.id),
      source_scene_record_id:record.id,
      order,
      narration_exact:{mode:"text_reference",text:String(f.Narration||""),script_sha256:scriptHash},
      visual_idea:specificV2Instruction?
        `${visualIdea}\n\n[ADDITIF SPÉCIFIQUE V2 — MONTAGE] SCÈNE ${order} — ${specificV2Instruction}`:
        visualIdea,
      image_prompt:String(f["Prompt image"]||""),
      screen_text:String(f["Texte écran"]||""),
      planned_duration_s:duration,
      measured_duration_s:null,
      zoom_percent:Number(f["Zoom %"]||3),
      framing:{type:f["Type de plan"]?.name||f["Type de plan"]||"",anchor:f.Ancrage?.name||f.Ancrage||"",hibou:Boolean(f.Hibou)},
      image:{candidates:candidateSource.candidates,selected:null,selection_reason:null,source_selected_path:candidateSource.source_selected_path},
      visual_group:String(f["Groupe visuel"]||"").trim()||null,
      persona_case:String(f["Persona case"]||"").trim()||null,
      qualify:String(f.Qualify||"").trim()||null,
      disqualify:String(f.Disqualify||"").trim()||null,
      condition:String(f.Condition||"").trim()||null,
      risk:String(f.Risk||"").trim()||null,
      source_label:String(f["Source label"]||"").trim()||null,
      jurisdiction:String(f.Jurisdiction||"").trim()||null,
      as_of_date:String(f["As of date"]||"").trim()||null,
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

  const contract={
    contract_version:"HIBOU_VIDEO_CONTRACT_V1",
    contract_state:"storyboard",
    content:{
      content_id:contentRecord.id,
      title:String(content.Sujet||""),
      script_version:Number(content["Version script"]||1),
      profile_version:String(profile.Version||"HIBOU_VIRAL_V1@2.4-V4.2"),
      profile_record_id:profileRecord?.id||null,
      source_default_production_mode:String(profile["Mode production par défaut"]?.name||profile["Mode production par défaut"]||"final").trim().toLowerCase(),
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
      video_prompt_graph_v1:Boolean(profile["Prompt Graph V1"]),
      video_planning_audit_v1:Boolean(profile["Planning audit V1"])
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
      content_brief_sha256:sha(content["Prompt / consignes"]||""),
      reference_image_url:String(process.env.HIBOU_REFERENCE_IMAGE_URL||""),
      reference_asset_repo_path:"video/assets/hibou-canonical-512.webp.b64",
      reference_mode:"deterministic_character_overlay",
      language:"fr",
      text_in_generated_images:false,
      branding:{
        text:"Le Hibou Rusé",
        position:"bottom-center",
        size:"small",
        color:"sand",
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
      voice_profile_id:String(profile["Voix"]||"").split("—")[0].trim()||"VOICE_V4_ORIGINAL",
      voice_profile_text:String(profile["Voix"]||""),
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
      policy:"GLOBAL only; master sans morceau commercial non maîtrisé",
      source_policy_text:String(profile["Politique musique"]||"")
    },
    subtitles:{status:"pending",source:"exact narration text"},
    qc:{status:"TIMING_PASS_MEDIA_NOT_RUN",technical:{planned_duration_s:Number(total.toFixed(3)),scene_count:scenes.length}},
    validation:{human_required:true,publication_authorized:false,status:"STORYBOARD_READY"}
  };
  contract.content.source_fingerprints=sourceFingerprints(contract);
  return contract;
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

if(process.argv[1]&&resolve(fileURLToPath(import.meta.url))===resolve(process.argv[1])){
  const [command,a,b,...rest]=process.argv.slice(2);
  const dryRun=rest.includes("--dry-run")||b==="--dry-run";
  if(command==="export"){
    if(!a||!b) fail("usage: video-airtable-sync.mjs export <content-record-id> <output.json>");
    const result=await exportFromAirtable(a,b);
    process.stdout.write(JSON.stringify({ok:true,content_id:a,scene_count:result.scenes.length,output:resolve(b)})+"\n");
  }else if(command==="verify"){
    if(!a) fail("usage: video-airtable-sync.mjs verify <storyboard.json> [--source-snapshot=<json>]");
    const storyboard=JSON.parse(readFileSync(resolve(a),"utf8"));
    const snapshotArg=[b,...rest].find(value=>String(value||"").startsWith("--source-snapshot="));
    const receipt=snapshotArg?
      verifyAirtableStoryboardSnapshot(
        storyboard,
        JSON.parse(readFileSync(resolve(snapshotArg.slice("--source-snapshot=".length)),"utf8"))
      ):
      await verifyAirtableStoryboardFreshness(storyboard);
    process.stdout.write(JSON.stringify(receipt)+"\n");
  }else if(command==="report"){
    if(!a||!b) fail("usage: video-airtable-sync.mjs report <content-record-id> <manifest.json> [--dry-run]");
    process.stdout.write(JSON.stringify(await reportResult(a,b,{dryRun}))+"\n");
  }else if(command==="report-error"){
    if(!a||!b) fail("usage: video-airtable-sync.mjs report-error <content-record-id> <message> [--dry-run]");
    process.stdout.write(JSON.stringify(await reportError(a,b,{dryRun}))+"\n");
  }else fail("command must be export, verify, report or report-error");
}
