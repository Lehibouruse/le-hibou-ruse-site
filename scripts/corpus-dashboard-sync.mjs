#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { inventoryMedia } from "./media-storage-inventory.mjs";
import { queryAllRecords, updateRecord } from "../lib/airtable.js";

const TABLE_ID="tblEzEeSpFz8rcfAq";
const ALIASES=JSON.parse(readFileSync(resolve("config/corpus-competitor-aliases.json"),"utf8")).aliases||{};
const VIDEO_EXT=new Set([".mp4",".mov",".mkv",".webm"]);

const norm=(value)=>String(value||"").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");

function parseArgs(argv){
  const args={root:process.env.HIBOU_MEDIA_ROOT||resolve(process.env.USERPROFILE||process.env.HOME||".","HibouMedia"),apply:false};
  for(const item of argv){
    if(item.startsWith("--root=")) args.root=resolve(item.slice(7));
    else if(item==="--apply") args.apply=true;
    else throw new Error("argument inconnu: "+item);
  }
  return args;
}
function walk(root,out=[]){
  if(!existsSync(root)) return out;
  for(const e of readdirSync(root,{withFileTypes:true})){
    const p=resolve(root,e.name);
    if(e.isDirectory()) walk(p,out); else if(e.isFile()) out.push(p);
  }
  return out;
}
function canonicalBucket(bucket){
  const n=norm(bucket);
  return ALIASES[n]||bucket;
}
function forensicStats(root){
  const by={};
  for(const path of walk(root)){
    if(basename(path)!=="manifest.json") continue;
    try{
      const m=JSON.parse(readFileSync(path,"utf8"));
      if(m.schema!=="HIBOU_FORENSIC_PACKAGE_V1") continue;
      const rel=path.slice(resolve(root).length+1).replaceAll("\\","/");
      const bucket=rel.split("/")[0]||"_root";
      const name=canonicalBucket(bucket);
      const row=by[name]||(by[name]={forensic:0,transcribed:0});
      row.forensic+=1;
      const transcript=m.transcript||{};
      if(transcript.status==="ok") row.transcribed+=1;
    }catch{}
  }
  return by;
}
function activeQueueCounts(){
  const path=resolve("config/local-worker-queue.json");
  if(!existsSync(path)) return {};
  try{
    const data=JSON.parse(readFileSync(path,"utf8"));
    const by={};
    for(const job of data.jobs||[]){
      if(job?.active!==true) continue;
      const name=canonicalBucket(job.concurrent||"");
      const urls=Array.isArray(job.urls)?job.urls:String(job.urls||"").split(/\r?\n/).filter(Boolean);
      by[name]=(by[name]||0)+urls.length;
    }
    return by;
  }catch{return {};}
}
export function buildCorpusProposal(inventory,forensic,queue){
  const by={};
  for(const file of inventory.files||[]){
    const name=canonicalBucket(file.bucket);
    const row=by[name]||(by[name]={downloaded:0,bytes:0});
    row.bytes+=Number(file.bytes||0);
    if(VIDEO_EXT.has(extname(file.path).toLowerCase())) row.downloaded+=1;
  }
  const names=new Set([...Object.keys(by),...Object.keys(forensic),...Object.keys(queue)]);
  return [...names].sort().map(name=>{
    const media=by[name]||{downloaded:0,bytes:0}, f=forensic[name]||{forensic:0,transcribed:0};
    return {
      competitor:name,
      fields:{
        "Vidéos téléchargées":media.downloaded,
        "Taille Go":Math.round(media.bytes/1024/1024/1024*100)/100,
        "Forensic prêts":f.forensic,
        "Transcrites":f.transcribed,
        "URLs en file":queue[name]||0,
        "Dernière MAJ":new Date().toISOString(),
      }
    };
  });
}
async function applyProposal(proposal){
  if(!process.env.AIRTABLE_TOKEN) throw new Error("AIRTABLE_TOKEN absent ; utiliser le mode dry-run ou fournir le token localement");
  const records=await queryAllRecords(TABLE_ID,{}, {maxRecords:1000});
  const index=new Map(records.map(r=>[norm(r.fields?.["Concurrent"]),r]));
  const result=[];
  for(const row of proposal){
    const rec=index.get(norm(row.competitor));
    if(!rec){ result.push({competitor:row.competitor,status:"unmatched"}); continue; }
    const target=Number(rec.fields?.["Cible canonique"]||0);
    const fields={...row.fields};
    if(target>0) fields["Couverture %"]=Math.min(1,Number(fields["Vidéos téléchargées"]||0)/target);
    await updateRecord(TABLE_ID,rec.id,fields);
    result.push({competitor:row.competitor,status:"updated",record_id:rec.id});
  }
  return result;
}
async function main(){
  const args=parseArgs(process.argv.slice(2));
  const inventory=await inventoryMedia(args.root,{hash:false});
  const forensic=forensicStats(args.root);
  const queue=activeQueueCounts();
  const proposal=buildCorpusProposal(inventory,forensic,queue);
  const output={schema:"HIBOU_CORPUS_DASHBOARD_SYNC_V1",root:resolve(args.root),dry_run:!args.apply,proposal,unmatched_policy:"never_create_or_guess_on_apply"};
  if(args.apply) output.result=await applyProposal(proposal);
  process.stdout.write(JSON.stringify(output,null,2)+"\n");
}
if(import.meta.url===`file://${process.argv[1]}`) main().catch(e=>{console.error(String(e?.stack||e));process.exitCode=1;});
