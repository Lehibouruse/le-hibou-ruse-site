#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

function fail(m){throw new Error(m);}
function sha256(path){return createHash("sha256").update(readFileSync(path)).digest("hex");}
function probe(path){
 const r=spawnSync("ffprobe",["-v","error","-select_streams","v:0","-show_entries","stream=codec_name,width,height,pix_fmt","-of","json",path],{encoding:"utf8"});
 if(r.status!==0) return {ok:false,error:String(r.stderr||"ffprobe failed").trim()};
 try{const d=JSON.parse(r.stdout);const s=d.streams?.[0];return s?{ok:true,...s}:{ok:false,error:"no video/image stream"};}catch(e){return {ok:false,error:String(e)};}
}
export function qcImageBatch(batch,{minWidth=768,minHeight=1280,aspectTolerance=0.035}={}){
 if(batch?.schema!=="HIBOU_IMAGE_BATCH_V1") fail("unsupported image batch manifest");
 const target=9/16, seen=new Map(), rows=[];
 for(const [candidateId,item] of Object.entries(batch.results||{})){
   for(const output of item.outputs||[]){
     const path=resolve(output.path), p=probe(path);
     let hash=null, duplicateOf=null, aspect=null, checks={decode:false,dimensions:false,vertical_aspect:false,unique_exact:true};
     if(p.ok){
       hash=sha256(path); aspect=Number(p.width)/Number(p.height);
       checks.decode=true; checks.dimensions=Number(p.width)>=minWidth&&Number(p.height)>=minHeight;
       checks.vertical_aspect=Math.abs(aspect-target)<=aspectTolerance;
       if(seen.has(hash)){checks.unique_exact=false;duplicateOf=seen.get(hash);}else seen.set(hash,candidateId);
     }
     rows.push({candidate_id:candidateId,scene_id:item.scene_id,candidate:item.candidate,path,sha256:hash,width:p.width??null,height:p.height??null,aspect_ratio:aspect,codec:p.codec_name??null,duplicate_of:duplicateOf,checks,status:Object.values(checks).every(Boolean)?"PASS":"REJECT",error:p.ok?"":p.error});
   }
 }
 const byScene={};
 for(const row of rows){(byScene[row.scene_id]??=[]).push(row);}
 const sceneSummary=Object.fromEntries(Object.entries(byScene).map(([scene,items])=>[scene,{pass:items.filter(x=>x.status==="PASS").length,reject:items.filter(x=>x.status!=="PASS").length,total:items.length}]));
 return {schema:"HIBOU_IMAGE_TECH_QC_V1",content_id:batch.content_id,target_aspect_ratio:target,min_width:minWidth,min_height:minHeight,aspect_tolerance:aspectTolerance,rows,scene_summary:sceneSummary,all_scenes_have_candidate:Object.values(sceneSummary).every(x=>x.pass>=1),paid_fallback:false};
}
if(import.meta.url===`file://${process.argv[1]}`){
 const [manifestPath,outPath]=process.argv.slice(2); if(!manifestPath||!outPath) fail("usage: video-image-qc.mjs batch-manifest.json image-qc.json");
 const q=qcImageBatch(JSON.parse(readFileSync(resolve(manifestPath),"utf8"))); writeFileSync(resolve(outPath),JSON.stringify(q,null,2)); process.stdout.write(JSON.stringify({ok:true,all_scenes_have_candidate:q.all_scenes_have_candidate,rows:q.rows.length})+"\n");
}
