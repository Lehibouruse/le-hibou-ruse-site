#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const DURABLE_STORAGE_PLAN_SCHEMA = "HIBOU_DURABLE_STORAGE_PLAN_V1";

const CRITICAL = new Set([
  "master","contract","storyboard","qc","human_review",
  "artifact_registry","pipeline_state","selected_image"
]);
const HIGH = new Set([
  "audio","subtitles","creative_qc","human_selection_manifest",
  "candidate_review","review_diff","incremental_retouch_plan",
  "asset_resolved_contract","audio_mix_manifest"
]);

function fail(m){ throw new Error(m); }
function safe(v){
  return String(v||"unknown")
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/g,"-")
    .replace(/^-+|-+$/g,"")
    .slice(0,120)||"unknown";
}
function retention(kind){
  if(CRITICAL.has(kind)) return "critical";
  if(HIGH.has(kind)) return "high";
  return "standard";
}
function retentionPriority(value){
  return value==="critical"?0:value==="high"?1:2;
}
function normalizeDurableUrl(value){
  const raw=String(value||"").trim();
  if(!raw) return null;
  if(
    /^[A-Za-z]:[\\/]/.test(raw) ||
    raw.startsWith("/") ||
    raw.startsWith("\\\\")
  ){
    fail("durable_url must be a non-local absolute URI");
  }
  let parsed;
  try{ parsed=new URL(raw); }
  catch{ fail("durable_url must be a non-local absolute URI"); }
  if(!parsed.protocol || parsed.protocol.toLowerCase()==="file:"){
    fail("durable_url must be a non-local absolute URI");
  }
  return raw;
}
function immutableObjectKey(hash){
  return `hibou-video/objects/sha256/${hash.slice(0,2)}/${hash}`;
}

export function buildDurableStoragePlan(registry,{content_id="",job_id=""}={}){
  if(registry?.schema!=="HIBOU_VIDEO_ARTIFACT_REGISTRY_V2"){
    fail("HIBOU_VIDEO_ARTIFACT_REGISTRY_V2 required");
  }
  const content=safe(content_id);
  const job=safe(job_id||"run");
  const entries=(registry.entries||[]).map(entry=>{
    const hash=String(entry?.sha256||"").toLowerCase();
    if(!/^[0-9a-f]{64}$/.test(hash)) fail("artifact sha256 missing or invalid");
    const kind=String(entry?.kind||"artifact");
    const name=safe(entry?.name||kind);
    const sizeBytes=Number(entry?.size_bytes||0);
    if(!Number.isFinite(sizeBytes)||sizeBytes<0) fail("artifact size_bytes invalid");
    const durableUrl=normalizeDurableUrl(entry?.durable_url);
    const retentionClass=retention(kind);
    return {
      kind,
      name,
      local_path:entry.path||null,
      sha256:hash,
      size_bytes:sizeBytes,
      metadata:entry?.metadata||null,
      retention_class:retentionClass,
      copy_priority:retentionPriority(retentionClass),
      action:durableUrl?"VERIFY_DURABLE":"COPY_REQUIRED",
      target_key:`hibou-video/${content}/${job}/${hash}/${name}`,
      object_key:immutableObjectKey(hash),
      run_reference_key:`hibou-video/runs/${content}/${job}/${safe(kind)}/${name}`,
      existing_durable_url:durableUrl,
      verification:{
        expected_sha256:hash,
        expected_size_bytes:sizeBytes,
        verify_after_transfer:true
      },
      upload_performed:false
    };
  });
  const counts={critical:0,high:0,standard:0};
  for(const e of entries) counts[e.retention_class]+=1;

  const objectMap=new Map();
  for(const entry of entries){
    const current=objectMap.get(entry.sha256);
    if(current){
      if(current.size_bytes!==entry.size_bytes){
        fail("same sha256 cannot declare conflicting size_bytes");
      }
      current.reference_count+=1;
      if(entry.local_path&&!current.source_paths.includes(entry.local_path)){
        current.source_paths.push(entry.local_path);
      }
      if(
        entry.existing_durable_url &&
        !current.candidate_durable_urls.includes(entry.existing_durable_url)
      ){
        current.candidate_durable_urls.push(entry.existing_durable_url);
      }
      if(entry.copy_priority<current.copy_priority){
        current.copy_priority=entry.copy_priority;
        current.retention_class=entry.retention_class;
      }
      continue;
    }
    objectMap.set(entry.sha256,{
      sha256:entry.sha256,
      size_bytes:entry.size_bytes,
      object_key:entry.object_key,
      retention_class:entry.retention_class,
      copy_priority:entry.copy_priority,
      source_paths:entry.local_path?[entry.local_path]:[],
      candidate_durable_urls:entry.existing_durable_url
        ?[entry.existing_durable_url]
        :[],
      reference_count:1,
      verify_sha256_required:true,
      verify_size_required:true,
      upload_performed:false
    });
  }

  const objects=[...objectMap.values()]
    .map(object=>({
      ...object,
      preferred_action:object.candidate_durable_urls.length
        ?"VERIFY_EXISTING_ELSE_COPY"
        :"COPY_REQUIRED"
    }))
    .sort((a,b)=>
      a.copy_priority-b.copy_priority ||
      a.sha256.localeCompare(b.sha256)
    );

  const uniqueSizeBytes=objects.reduce((sum,obj)=>sum+obj.size_bytes,0);
  const transferSummary={
    reference_count:entries.length,
    unique_object_count:objects.length,
    duplicate_reference_count:Math.max(0,entries.length-objects.length),
    referenced_total_size_bytes:entries.reduce((s,e)=>s+e.size_bytes,0),
    unique_total_size_bytes:uniqueSizeBytes,
    copy_required_object_count:objects.filter(
      x=>x.preferred_action==="COPY_REQUIRED"
    ).length,
    verify_existing_object_count:objects.filter(
      x=>x.preferred_action==="VERIFY_EXISTING_ELSE_COPY"
    ).length,
    critical_unique_object_count:objects.filter(
      x=>x.retention_class==="critical"
    ).length
  };

  return {
    schema:DURABLE_STORAGE_PLAN_SCHEMA,
    source_registry_schema:registry.schema,
    content_id:content_id||null,
    job_id:job_id||null,
    production_mode:registry.production_mode||"final",
    preview_only:Boolean(registry.preview_only),
    entry_count:entries.length,
    total_size_bytes:entries.reduce((s,e)=>s+e.size_bytes,0),
    retention_counts:counts,
    transfer_summary:transferSummary,
    objects,
    entries,
    execution:{
      upload_performed:false,
      files_moved:false,
      files_deleted:false,
      network_required:false
    },
    policy:{
      content_addressed_keys:true,
      immutable_hash_required:true,
      masters_and_selected_images_are_critical:true,
      local_paths_are_not_durable_urls:true,
      uploader_is_a_separate_future_step:true,
      immutable_objects_are_deduplicated_by_sha256:true,
      run_references_are_separate_from_object_identity:true,
      existing_durable_locations_must_be_verified_not_trusted:true,
      local_paths_cannot_be_declared_durable:true,
      backend_agnostic_object_manifest:true,
      human_review_required:true,
      publication_authorized:false
    },
    publication_authorized:false
  };
}

if(import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const [registryPath,outPath,contentId="",jobId=""]=process.argv.slice(2);
  if(!registryPath||!outPath) fail("usage: node scripts/video-durable-storage-plan.mjs artifact-registry.json storage-plan.json [content-id] [job-id]");
  const registry=JSON.parse(readFileSync(resolve(registryPath),"utf8"));
  const plan=buildDurableStoragePlan(registry,{content_id:contentId,job_id:jobId});
  writeFileSync(resolve(outPath),JSON.stringify(plan,null,2)+"\n");
  process.stdout.write(JSON.stringify({
    ok:true,schema:plan.schema,entries:plan.entry_count,
    total_size_bytes:plan.total_size_bytes,
    unique_objects:plan.transfer_summary.unique_object_count,
    unique_total_size_bytes:plan.transfer_summary.unique_total_size_bytes,
    upload_performed:false,
    publication_authorized:false
  })+"\n");
}
