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
    const alreadyDurable=Boolean(String(entry?.durable_url||"").trim());
    return {
      kind,
      name,
      local_path:entry.path||null,
      sha256:hash,
      size_bytes:Number(entry?.size_bytes||0),
      metadata:entry?.metadata||null,
      retention_class:retention(kind),
      action:alreadyDurable?"VERIFY_DURABLE":"COPY_REQUIRED",
      target_key:`hibou-video/${content}/${job}/${hash}/${name}`,
      existing_durable_url:entry?.durable_url||null,
      upload_performed:false
    };
  });
  const counts={critical:0,high:0,standard:0};
  for(const e of entries) counts[e.retention_class]+=1;
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
    total_size_bytes:plan.total_size_bytes,upload_performed:false,
    publication_authorized:false
  })+"\n");
}
