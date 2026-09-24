#!/usr/bin/env node
import { createHash } from "node:crypto";
import { createReadStream, readdirSync, statSync, statfsSync, writeFileSync } from "node:fs";
import { basename, extname, relative, resolve, sep } from "node:path";

const MEDIA_EXT=new Set([".mp4",".mov",".mkv",".webm",".wav",".mp3",".m4a",".flac",".png",".jpg",".jpeg",".webp",".json"]);
const DEFAULT_ROOT=resolve(process.env.HIBOU_MEDIA_ROOT || resolve(process.env.USERPROFILE || process.env.HOME || ".", "HibouMedia"));

function parseArgs(argv){
  const out={root:DEFAULT_ROOT,hash:true,writeReport:""};
  for(const arg of argv){
    if(arg.startsWith("--root=")) out.root=resolve(arg.slice(7));
    else if(arg==="--no-hash") out.hash=false;
    else if(arg.startsWith("--write-report=")) out.writeReport=resolve(arg.slice("--write-report=".length));
    else throw new Error("argument inconnu: "+arg);
  }
  return out;
}
function walk(root,out=[]){
  for(const entry of readdirSync(root,{withFileTypes:true})){
    const path=resolve(root,entry.name);
    if(entry.isDirectory()) walk(path,out);
    else if(entry.isFile()&&MEDIA_EXT.has(extname(entry.name).toLowerCase())) out.push(path);
  }
  return out;
}
async function sha256(path){
  return await new Promise((resolveHash,reject)=>{
    const h=createHash("sha256");
    const s=createReadStream(path);
    s.on("data",chunk=>h.update(chunk));
    s.on("error",reject);
    s.on("end",()=>resolveHash(h.digest("hex")));
  });
}
function bucket(root,path){
  const rel=relative(root,path);
  const first=rel.split(sep)[0];
  return first&&first!==basename(path)?first:"_root";
}
function gib(bytes){ return Math.round(bytes/1024/1024/1024*100)/100; }

export async function inventoryMedia(rootArg,{hash=true}={}){
  const root=resolve(rootArg);
  const fs=statfsSync(root);
  const disk={free_bytes:Number(fs.bavail)*Number(fs.bsize),total_bytes:Number(fs.blocks)*Number(fs.bsize)};
  const files=walk(root);
  const rows=[];
  for(const path of files){
    const st=statSync(path);
    rows.push({
      path:relative(root,path).replaceAll("\\","/"),
      bytes:st.size,
      modified_at:st.mtime.toISOString(),
      bucket:bucket(root,path),
      sha256:hash?await sha256(path):null,
    });
  }
  const byBucket={};
  for(const row of rows){
    const b=byBucket[row.bucket]||(byBucket[row.bucket]={files:0,bytes:0});
    b.files+=1;b.bytes+=row.bytes;
  }
  for(const value of Object.values(byBucket)) value.gib=gib(value.bytes);
  const groups=new Map();
  for(const row of rows){
    if(!row.sha256) continue;
    const key=row.sha256;
    if(!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(row);
  }
  const duplicate_groups=[...groups.entries()]
    .filter(([,items])=>items.length>1)
    .map(([sha,items])=>({
      sha256:sha,
      copies:items.length,
      bytes_each:items[0].bytes,
      potential_reclaim_bytes:(items.length-1)*items[0].bytes,
      paths:items.map(x=>x.path),
    }))
    .sort((a,b)=>b.potential_reclaim_bytes-a.potential_reclaim_bytes);
  const potential_reclaim_bytes=duplicate_groups.reduce((s,x)=>s+x.potential_reclaim_bytes,0);
  const free_ratio=disk.total_bytes?disk.free_bytes/disk.total_bytes:0;
  return {
    schema:"HIBOU_MEDIA_STORAGE_INVENTORY_V1",
    generated_at:new Date().toISOString(),
    root,
    hashing_enabled:hash,
    file_count:rows.length,
    total_media_bytes:rows.reduce((s,x)=>s+x.bytes,0),
    total_media_gib:gib(rows.reduce((s,x)=>s+x.bytes,0)),
    disk:{...disk,free_gib:gib(disk.free_bytes),total_gib:gib(disk.total_bytes),free_ratio:Math.round(free_ratio*10000)/10000},
    alert:free_ratio<0.10?"CRITICAL_LOW_DISK":free_ratio<0.20?"LOW_DISK":"OK",
    by_bucket:byBucket,
    duplicate_groups,
    potential_reclaim_bytes,
    potential_reclaim_gib:gib(potential_reclaim_bytes),
    files:rows,
    deletion_performed:false,
    archive_performed:false,
    recommendations:[
      "Conserver les analyses/manifestes avant toute décision sur les sources brutes.",
      "Examiner les duplicate_groups par SHA-256 ; ne supprimer aucun doublon automatiquement.",
      free_ratio<0.20?"Prévoir rapidement une copie/extension de stockage avant nouveaux téléchargements lourds.":"Espace libre supérieur ou égal à 20 % : pas d'alerte immédiate.",
    ],
  };
}

if(import.meta.url===`file://${process.argv[1]}`){
  const args=parseArgs(process.argv.slice(2));
  const report=await inventoryMedia(args.root,{hash:args.hash});
  const body=JSON.stringify(report,null,2)+"\n";
  if(args.writeReport) writeFileSync(args.writeReport,body,{encoding:"utf8",mode:0o600});
  process.stdout.write(body);
}
