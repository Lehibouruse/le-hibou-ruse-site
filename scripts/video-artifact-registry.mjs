#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";
function sha256(path){return createHash("sha256").update(readFileSync(path)).digest("hex");}
export function buildRegistry(entries,{production_mode="final",publication_authorized=false,human_review_required=true}={}){
 const mode=String(production_mode||"final").toLowerCase()==="preview"?"preview":"final";
 const previewOnly=mode==="preview";
 return {
  schema:"HIBOU_VIDEO_ARTIFACT_REGISTRY_V2",
  generated_at:new Date().toISOString(),
  durable_storage_required:true,
  production_mode:mode,
  preview_only:previewOnly,
  human_review_required:Boolean(human_review_required),
  publication_authorized:publication_authorized===true&&!previewOnly,
  entries:entries.filter(e=>existsSync(resolve(e.path))).map(e=>{
   const p=resolve(e.path),s=statSync(p);
   return {
    kind:e.kind||"artifact",
    name:basename(p),
    path:p,
    sha256:sha256(p),
    size_bytes:s.size,
    durable_url:e.durable_url||null,
    approved:Boolean(e.approved),
    preview_only:previewOnly,
    publication_authorized:false
   };
  })
 };
}
if(import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [specPath,outPath]=process.argv.slice(2); if(!specPath||!outPath) throw new Error("usage: video-artifact-registry.mjs registry-spec.json registry.json");
 const spec=JSON.parse(readFileSync(resolve(specPath),"utf8"));
 const r=buildRegistry(spec.entries||[],{
  production_mode:spec.production_mode||"final",
  publication_authorized:false,
  human_review_required:spec.human_review_required!==false
 });
 writeFileSync(resolve(outPath),JSON.stringify(r,null,2));
 process.stdout.write(JSON.stringify({ok:true,count:r.entries.length,production_mode:r.production_mode,preview_only:r.preview_only,publication_authorized:r.publication_authorized})+"\n");
}
