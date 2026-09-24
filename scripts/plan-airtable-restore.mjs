#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function fail(message){ throw new Error(message); }

export function buildRestorePlan(dirArg){
  const dir=resolve(dirArg);
  const manifest=JSON.parse(readFileSync(resolve(dir,"manifest.json"),"utf8"));
  if(manifest.schema!=="HIBOU_AIRTABLE_BACKUP_MANIFEST_V1") fail("manifest schema invalide");
  const steps=(manifest.tables||[]).map((item,index)=>({
    order:index+1,
    table_name:item.table_name,
    table_id:item.table_id,
    source_file:item.file,
    source_records:item.record_count,
    automatic_write_allowed:false,
    reason:"Airtable record IDs and linked-record references cannot be recreated safely by a blind restore. Restore must target a staging base first, remap IDs, then verify links before production write.",
  }));
  return {
    schema:"HIBOU_AIRTABLE_RESTORE_PLAN_V1",
    source_exported_at:manifest.exported_at,
    source_base_id:manifest.base_id,
    destructive_restore_enabled:false,
    target:"staging_base_required",
    steps,
    prerequisites:[
      "Create an empty staging Airtable base with compatible schemas.",
      "Import non-linked tables first.",
      "Create old_record_id -> new_record_id mappings.",
      "Rewrite linked-record references using those mappings.",
      "Run counts and referential-integrity checks.",
      "Require explicit human approval before any production restore.",
    ],
  };
}

if(import.meta.url===`file://${process.argv[1]}`){
  const dir=process.argv[2];
  if(!dir) fail("usage: plan-airtable-restore.mjs <backup-directory>");
  process.stdout.write(JSON.stringify(buildRestorePlan(dir),null,2)+"\n");
}
