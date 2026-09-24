#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, relative, resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { verifyManifest } from "./restore-rehearsal-local.mjs";
import { insideRepository } from "./backup-project-local.mjs";

const text=(v)=>String(v??"").trim();
const sha256=(buf)=>createHash("sha256").update(buf).digest("hex");

function parseArgs(argv){
  const args={copy:false,source:"",destination:""};
  for(const item of argv){
    if(item==="--copy") args.copy=true;
    else if(item.startsWith("--source=")) args.source=item.slice("--source=".length);
    else if(item.startsWith("--destination=")) args.destination=item.slice("--destination=".length);
    else throw new Error("argument inconnu: "+item);
  }
  return args;
}

function childOf(parent,child){
  const p=resolve(parent), c=resolve(child);
  const rel=relative(p,c);
  return rel==="" || (!rel.startsWith(".."+sep) && rel!=="..");
}

export function independentCopyPlan({source,destination}={}){
  const src=resolve(source||"");
  const destRoot=resolve(destination||"");
  return {
    schema:"HIBOU_INDEPENDENT_BACKUP_COPY_PLAN_V1",
    source:src,
    destination_root:destRoot,
    source_exists:Boolean(source&&existsSync(src)),
    destination_inside_repository:Boolean(destination&&insideRepository(destRoot)),
    source_inside_destination:Boolean(source&&destination&&childOf(destRoot,src)),
    destination_inside_source:Boolean(source&&destination&&childOf(src,destRoot)),
    network_access:false,
    copy_performed:false,
    note:"Destination independence is operational, not physically proven. Prefer an external disk, NAS, or separately synced cloud folder."
  };
}

export function copyIndependentBackup({source,destination}){
  if(!text(source)||!text(destination)) throw new Error("--source et --destination sont requis");
  const src=resolve(source), destRoot=resolve(destination);
  if(!existsSync(src)) throw new Error("backup source introuvable");
  if(insideRepository(destRoot)) throw new Error("destination indépendante refusée dans le dépôt Git");
  if(childOf(src,destRoot)||childOf(destRoot,src)) throw new Error("source et destination ne doivent pas être imbriquées");

  const before=verifyManifest(src);
  if(!before.ok) throw new Error("backup source invalide : vérification manifest/SHA-256 échouée");

  const sourceManifest=readFileSync(resolve(src,"manifest.json"));
  const sourceManifestSha256=sha256(sourceManifest);
  const target=resolve(destRoot,basename(src));
  if(existsSync(target)) throw new Error("destination déjà existante : refus d'écraser un backup");

  mkdirSync(destRoot,{recursive:true});
  cpSync(src,target,{recursive:true,errorOnExist:true,force:false,preserveTimestamps:true});

  const after=verifyManifest(target);
  if(!after.ok) throw new Error("copie effectuée mais vérification SHA-256 destination échouée");

  const proof={
    schema:"HIBOU_INDEPENDENT_BACKUP_COPY_PROOF_V1",
    copied_at:new Date().toISOString(),
    source_backup:basename(src),
    destination_backup:target,
    source_manifest_sha256:sourceManifestSha256,
    artifact_count:(after.manifest?.artifacts||[]).length,
    source_verified:true,
    destination_verified:true,
    network_access:false,
    secret_values_logged:false,
    physical_independence_asserted:false,
    note:"The tool proves integrity and path separation only. Operator must choose a genuinely independent storage destination."
  };
  writeFileSync(resolve(target,"independent-copy-proof.json"),JSON.stringify(proof,null,2)+"\n",{mode:0o600});
  return proof;
}

if(import.meta.url==="file://"+process.argv[1]){
  const args=parseArgs(process.argv.slice(2));
  if(!args.copy){
    process.stdout.write(JSON.stringify(independentCopyPlan(args),null,2)+"\n");
  }else{
    process.stdout.write(JSON.stringify(copyIndependentBackup(args),null,2)+"\n");
  }
}
