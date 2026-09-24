#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function sha256(value){ return createHash("sha256").update(value).digest("hex"); }
function fail(message){ throw new Error(message); }

export function verifyBackup(dirArg){
  const dir=resolve(dirArg);
  const manifestPath=resolve(dir,"manifest.json");
  if(!existsSync(manifestPath)) fail("manifest.json absent");
  const manifest=JSON.parse(readFileSync(manifestPath,"utf8"));
  if(manifest.schema!=="HIBOU_AIRTABLE_BACKUP_MANIFEST_V1") fail("manifest schema invalide");
  const results=[];
  for(const item of manifest.tables||[]){
    const path=resolve(dir,item.file);
    if(!existsSync(path)) fail(`fichier absent: ${item.file}`);
    const text=readFileSync(path,"utf8");
    const actual=sha256(text);
    const payload=JSON.parse(text);
    const okHash=actual===item.sha256;
    const okSchema=payload.schema==="HIBOU_AIRTABLE_BACKUP_TABLE_V1";
    const okCount=Number(payload.record_count)===(payload.records||[]).length && Number(payload.record_count)===Number(item.record_count);
    results.push({file:item.file,table_name:item.table_name,hash_ok:okHash,schema_ok:okSchema,count_ok:okCount,records:payload.records?.length||0});
  }
  const ok=results.every(x=>x.hash_ok&&x.schema_ok&&x.count_ok);
  return {ok,manifest:manifestPath,table_count:results.length,results};
}

if(import.meta.url===`file://${process.argv[1]}`){
  const dir=process.argv[2];
  if(!dir) fail("usage: verify-airtable-backup.mjs <backup-directory>");
  const result=verifyBackup(dir);
  process.stdout.write(JSON.stringify(result,null,2)+"\n");
  if(!result.ok) process.exit(2);
}
