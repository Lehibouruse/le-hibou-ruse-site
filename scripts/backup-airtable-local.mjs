#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const BASE_ID = String(process.env.HIBOU_AIRTABLE_BASE_ID || "appWyUX7TYPNrDbyP").trim();
const TOKEN = String(process.env.AIRTABLE_TOKEN || "").trim();

export const BACKUP_TABLES = [
  ["Roadmap","tblnvDaggsXY9bcOa"],
  ["Content Pipeline","tblRfS6laFuNBrDX1"],
  ["Montages","tbl0rkv9c2ZJRUhGz"],
  ["Livre","tblIoXioiPj3Rxhft"],
  ["Benchmark concurrents","tblSgKKbhiLPMqm9O"],
  ["Corpus source intégral","tblZsTkrlvzbwU9rr"],
  ["Profils vidéo","tblV4cbgdRQku6NYx"],
  ["Scènes vidéo","tblHjUmH1p2STleJ3"],
  ["Méthodologie vidéo","tblCOtKclFGr8afDa"],
  ["Sujets concurrents","tbl0CHUoi498t53V9"],
  ["Stack IA vidéo","tblKtti9ooxshimKI"],
  ["Configuration","tblXZsL4gTTSXG72d"],
];

const SENSITIVE_FIELD = /(secret|token|password|credential|private[_ -]?key|api[_ -]?key|access[_ -]?key)/i;
const SECRET_VALUE = /(sk-[A-Za-z0-9_-]{12,}|pat_[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,}|Bearer\s+[A-Za-z0-9._~+\/-]{12,})/i;

function slug(value){
  return String(value).normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^A-Za-z0-9]+/g,"-").replace(/^-|-$/g,"").toLowerCase();
}
function sha256(value){ return createHash("sha256").update(value).digest("hex"); }
function redactValue(value,key=""){
  if(SENSITIVE_FIELD.test(key)) return "[REDACTED]";
  if(typeof value==="string" && SECRET_VALUE.test(value)) return "[REDACTED]";
  if(Array.isArray(value)) return value.map((item)=>redactValue(item,key));
  if(value && typeof value==="object"){
    return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,redactValue(v,k)]));
  }
  return value;
}
export function sanitizeRecord(record){
  const fields=Object.fromEntries(Object.entries(record?.fields||{}).map(([k,v])=>[k,redactValue(v,k)]));
  return {id:String(record?.id||""),createdTime:String(record?.createdTime||""),fields};
}

async function page(tableId,offset=""){
  if(!TOKEN) throw new Error("AIRTABLE_TOKEN absent");
  const params=new URLSearchParams({pageSize:"100"});
  if(offset) params.set("offset",offset);
  const response=await fetch(`https://api.airtable.com/v0/${BASE_ID}/${tableId}?${params}`,{
    headers:{Authorization:`Bearer ${TOKEN}`},cache:"no-store"
  });
  if(!response.ok) throw new Error(`Airtable backup failed ${tableId}: HTTP ${response.status}`);
  return response.json();
}
async function allRecords(tableId){
  const records=[];
  let offset="";
  for(let i=0;i<100;i+=1){
    const data=await page(tableId,offset);
    records.push(...(data.records||[]).map(sanitizeRecord));
    if(!data.offset) break;
    offset=data.offset;
  }
  return records;
}

export async function backupTable(name,tableId,outDir,exportedAt){
  const records=await allRecords(tableId);
  const payload={
    schema:"HIBOU_AIRTABLE_BACKUP_TABLE_V1",
    exported_at:exportedAt,
    base_id:BASE_ID,
    table_name:name,
    table_id:tableId,
    record_count:records.length,
    records,
  };
  const serialized=JSON.stringify(payload,null,2)+"\n";
  const filename=`${slug(name)}.json`;
  const path=resolve(outDir,filename);
  writeFileSync(path,serialized,{encoding:"utf8",mode:0o600});
  return {table_name:name,table_id:tableId,file:filename,record_count:records.length,sha256:sha256(serialized)};
}

async function main(){
  const stamp=new Date().toISOString().replace(/[:.]/g,"-");
  const root=resolve(process.argv[2]||process.env.HIBOU_BACKUP_ROOT||".hibou-backups");
  const outDir=resolve(root,`airtable-${stamp}`);
  mkdirSync(outDir,{recursive:true,mode:0o700});
  const exportedAt=new Date().toISOString();
  const tables=[];
  for(const [name,id] of BACKUP_TABLES){
    process.stderr.write(`backup ${name}...\n`);
    tables.push(await backupTable(name,id,outDir,exportedAt));
  }
  const manifest={
    schema:"HIBOU_AIRTABLE_BACKUP_MANIFEST_V1",
    exported_at:exportedAt,
    base_id:BASE_ID,
    backup_directory:outDir,
    pii_tables_included:false,
    excluded_by_policy:["Leads","Ventes","Rétractations","Social Credentials"],
    secret_redaction:true,
    tables,
  };
  const manifestText=JSON.stringify(manifest,null,2)+"\n";
  writeFileSync(resolve(outDir,"manifest.json"),manifestText,{encoding:"utf8",mode:0o600});
  process.stdout.write(JSON.stringify({ok:true,directory:outDir,tables:tables.length,records:tables.reduce((n,t)=>n+t.record_count,0)},null,2)+"\n");
}
if(import.meta.url===`file://${process.argv[1]}`) main().catch((error)=>{console.error(error.message);process.exit(1);});
