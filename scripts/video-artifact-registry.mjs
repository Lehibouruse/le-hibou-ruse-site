#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename, resolve } from "node:path";
function sha256(path){return createHash("sha256").update(readFileSync(path)).digest("hex");}
export function buildRegistry(entries){
 return {schema:"HIBOU_VIDEO_ARTIFACT_REGISTRY_V1",generated_at:new Date().toISOString(),durable_storage_required:true,entries:entries.filter(e=>existsSync(resolve(e.path))).map(e=>{const p=resolve(e.path),s=statSync(p);return {kind:e.kind||"artifact",name:basename(p),path:p,sha256:sha256(p),size_bytes:s.size,durable_url:e.durable_url||null,approved:Boolean(e.approved)};})};
}
if(import.meta.url===`file://${process.argv[1]}`){
 const [specPath,outPath]=process.argv.slice(2); if(!specPath||!outPath) throw new Error("usage: video-artifact-registry.mjs registry-spec.json registry.json");
 const spec=JSON.parse(readFileSync(resolve(specPath),"utf8")); const r=buildRegistry(spec.entries||[]); writeFileSync(resolve(outPath),JSON.stringify(r,null,2)); process.stdout.write(JSON.stringify({ok:true,count:r.entries.length})+"\n");
}
