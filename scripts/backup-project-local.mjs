#!/usr/bin/env node
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "node:crypto";
import { createGzip, gunzipSync } from "node:zlib";
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { spawnSync } from "node:child_process";

const ROOT=process.cwd();
const PLAN=JSON.parse(readFileSync(resolve(ROOT,"config/backup-plan.json"),"utf8"));

const text=(v)=>String(v??"").trim();
const stamp=()=>new Date().toISOString().replaceAll(":","-").replace(/\.\d{3}Z$/,"Z");
const sha256=(buf)=>createHash("sha256").update(buf).digest("hex");
const slug=(name)=>name.normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-zA-Z0-9_-]+/g,"-").replace(/^-+|-+$/g,"").toLowerCase();

export function insideRepository(path,root=ROOT){
  const abs=resolve(path), base=resolve(root);
  const rel=relative(base,abs);
  return rel==="" || (!rel.startsWith(".."+sep) && rel!=="..");
}

export function deriveKey(passphrase,salt){
  if(text(passphrase).length<16) throw new Error("HIBOU_BACKUP_PASSPHRASE doit contenir au moins 16 caractères");
  return scryptSync(passphrase,salt,32);
}

export function encryptBuffer(buffer,passphrase){
  const salt=randomBytes(16), iv=randomBytes(12);
  const key=deriveKey(passphrase,salt);
  const cipher=createCipheriv("aes-256-gcm",key,iv);
  const ciphertext=Buffer.concat([cipher.update(buffer),cipher.final()]);
  const tag=cipher.getAuthTag();
  return Buffer.concat([Buffer.from("HIBOUENC1"),salt,iv,tag,ciphertext]);
}

export function decryptBuffer(buffer,passphrase){
  const magic=buffer.subarray(0,9).toString("utf8");
  if(magic!=="HIBOUENC1") throw new Error("format de sauvegarde chiffrée inconnu");
  const salt=buffer.subarray(9,25), iv=buffer.subarray(25,37), tag=buffer.subarray(37,53), ciphertext=buffer.subarray(53);
  const key=deriveKey(passphrase,salt);
  const decipher=createDecipheriv("aes-256-gcm",key,iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext),decipher.final()]);
}

function parseArgs(argv){
  const args={plan:false,git:false,airtable:false,includeSensitive:false};
  for(const item of argv){
    if(item==="--plan") args.plan=true;
    else if(item==="--git") args.git=true;
    else if(item==="--airtable") args.airtable=true;
    else if(item==="--all"){args.git=true;args.airtable=true;}
    else if(item==="--include-sensitive") args.includeSensitive=true;
    else if(item.startsWith("--output=")) args.output=item.slice("--output=".length);
    else throw new Error("argument inconnu: "+item);
  }
  if(!args.plan&&!args.git&&!args.airtable) args.plan=true;
  return args;
}

export function backupRoot(input){
  const root=resolve(input || process.env.HIBOU_BACKUP_ROOT || resolve(homedir(),"HibouBackups"));
  if(insideRepository(root)) throw new Error("Le répertoire de sauvegarde doit être hors du dépôt Git");
  return root;
}

async function airtablePage(tableId,offset,token,fetchImpl=fetch){
  const url=new URL(`https://api.airtable.com/v0/${PLAN.base_id}/${tableId}`);
  url.searchParams.set("pageSize","100");
  if(offset) url.searchParams.set("offset",offset);
  const response=await fetchImpl(url,{
    headers:{Authorization:`Bearer ${token}`},
    cache:"no-store",
    redirect:"error",
    signal:AbortSignal.timeout(30000),
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(`Airtable export ${tableId}: HTTP ${response.status}`);
  return data;
}

export async function exportAirtableTable(name,tableId,token,fetchImpl=fetch){
  if(!text(token)) throw new Error("AIRTABLE_TOKEN absent");
  const records=[];
  let offset="";
  do{
    const page=await airtablePage(tableId,offset,token,fetchImpl);
    records.push(...(Array.isArray(page.records)?page.records:[]));
    offset=text(page.offset);
  }while(offset);
  return {
    schema:"HIBOU_AIRTABLE_TABLE_BACKUP_V1",
    exported_at:new Date().toISOString(),
    base_id:PLAN.base_id,
    table:{name,id:tableId},
    record_count:records.length,
    records,
  };
}

async function gzipBuffer(buffer){
  const chunks=[];
  const {Readable,Writable}=await import("node:stream");
  await pipeline(
    Readable.from([buffer]),
    createGzip({level:9}),
    new Writable({write(chunk,_enc,cb){chunks.push(Buffer.from(chunk));cb();}})
  );
  return Buffer.concat(chunks);
}

function writeArtifact(dir,name,buffer,meta={}){
  mkdirSync(dir,{recursive:true});
  const path=resolve(dir,name);
  writeFileSync(path,buffer,{mode:0o600});
  return {file:basename(path),bytes:buffer.length,sha256:sha256(buffer),...meta};
}

async function backupAirtable(dir,{includeSensitive=false,fetchImpl=fetch}={}){
  const token=text(process.env.AIRTABLE_TOKEN);
  if(!token) throw new Error("AIRTABLE_TOKEN absent : aucun export Airtable effectué");
  const passphrase=text(process.env.HIBOU_BACKUP_PASSPHRASE);
  if(includeSensitive && !passphrase) throw new Error("HIBOU_BACKUP_PASSPHRASE absent : tables sensibles refusées");
  const artifacts=[];
  const tables=[
    ...PLAN.safe_tables.map(([name,id])=>({name,id,sensitive:false})),
    ...(includeSensitive?PLAN.sensitive_tables.map(([name,id])=>({name,id,sensitive:true})):[]),
  ];
  for(const table of tables){
    const payload=await exportAirtableTable(table.name,table.id,token,fetchImpl);
    const json=Buffer.from(JSON.stringify(payload,null,2)+"\n","utf8");
    const gz=await gzipBuffer(json);
    const stored=table.sensitive?encryptBuffer(gz,passphrase):gz;
    const ext=table.sensitive?".json.gz.enc":".json.gz";
    artifacts.push(writeArtifact(resolve(dir,"airtable"),slug(table.name)+ext,stored,{
      kind:"airtable",
      table_name:table.name,
      table_id:table.id,
      record_count:payload.record_count,
      encrypted:table.sensitive,
    }));
  }
  return artifacts;
}

function backupGit(dir){
  const git=spawnSync("git",["rev-parse","--show-toplevel"],{encoding:"utf8"});
  if(git.status!==0) throw new Error("git repository introuvable");
  const repoRoot=realpathSync(text(git.stdout));
  if(repoRoot!==realpathSync(ROOT)) throw new Error("Exécuter la sauvegarde à la racine du dépôt Hibou");
  const sha=text(spawnSync("git",["rev-parse","HEAD"],{encoding:"utf8"}).stdout);
  const outDir=resolve(dir,"git"); mkdirSync(outDir,{recursive:true});
  const bundle=resolve(outDir,"le-hibou-ruse.bundle");
  const r=spawnSync("git",["bundle","create",bundle,"--all"],{encoding:"utf8"});
  if(r.status!==0) throw new Error("git bundle failed: "+text(r.stderr));
  const bytes=readFileSync(bundle);
  return [{file:relative(dir,bundle).replaceAll("\\","/"),bytes:bytes.length,sha256:sha256(bytes),kind:"git_bundle",head:sha,encrypted:false}];
}

export function sanitizedPlan(){
  return {
    schema:PLAN.schema,
    base_id:PLAN.base_id,
    safe_tables:PLAN.safe_tables.map(([name,id])=>({name,id})),
    sensitive_tables:PLAN.sensitive_tables.map(([name,id])=>({name,id,default_export:false,encryption_required:true})),
    default_backup_root:resolve(homedir(),"HibouBackups"),
    secrets_written:false,
    offsite_copy_required:true,
  };
}

async function main(){
  const args=parseArgs(process.argv.slice(2));
  if(args.plan){
    process.stdout.write(JSON.stringify(sanitizedPlan(),null,2)+"\n");
    return;
  }
  const base=backupRoot(args.output);
  const dir=resolve(base,stamp());
  mkdirSync(dir,{recursive:true});
  const artifacts=[];
  if(args.git) artifacts.push(...backupGit(dir));
  if(args.airtable) artifacts.push(...await backupAirtable(dir,{includeSensitive:args.includeSensitive}));
  const manifest={
    schema:"HIBOU_LOCAL_BACKUP_MANIFEST_V1",
    created_at:new Date().toISOString(),
    backup_dir:dir,
    repository:basename(ROOT),
    artifacts,
    sensitive_included:Boolean(args.includeSensitive),
    secrets_written:false,
    offsite_copy_completed:false,
    restore_test_completed:false,
  };
  writeFileSync(resolve(dir,"manifest.json"),JSON.stringify(manifest,null,2)+"\n",{mode:0o600});
  process.stdout.write(JSON.stringify({ok:true,backup_dir:dir,artifact_count:artifacts.length,manifest:resolve(dir,"manifest.json")},null,2)+"\n");
}
if(import.meta.url===`file://${process.argv[1]}`) main().catch((error)=>{console.error(String(error?.message||error));process.exitCode=1;});
