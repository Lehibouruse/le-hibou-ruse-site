#!/usr/bin/env node
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const sha256=(buf)=>createHash("sha256").update(buf).digest("hex");

function fail(message){ throw new Error(message); }

export function verifyManifest(backupDir){
  const root=resolve(backupDir);
  const manifestPath=resolve(root,"manifest.json");
  if(!existsSync(manifestPath)) fail("manifest.json absent");
  const manifest=JSON.parse(readFileSync(manifestPath,"utf8"));
  const checks=[];
  for(const artifact of manifest.artifacts||[]){
    const path=resolve(root,artifact.file);
    if(!existsSync(path)){ checks.push({file:artifact.file,ok:false,reason:"missing"}); continue; }
    const body=readFileSync(path);
    const actual=sha256(body);
    checks.push({file:artifact.file,ok:actual===artifact.sha256,expected:artifact.sha256,actual});
  }
  return {manifest,checks,ok:checks.length>0&&checks.every(x=>x.ok)};
}

export function inspectSafeAirtableExports(backupDir,manifest){
  const root=resolve(backupDir);
  const checks=[];
  for(const artifact of (manifest.artifacts||[]).filter(x=>x.kind==="airtable"&&!x.encrypted)){
    try{
      const body=gunzipSync(readFileSync(resolve(root,artifact.file)));
      const payload=JSON.parse(body.toString("utf8"));
      const ok=payload.schema==="HIBOU_AIRTABLE_TABLE_BACKUP_V1"
        && payload.table?.id===artifact.table_id
        && payload.table?.name===artifact.table_name
        && payload.record_count===artifact.record_count
        && Array.isArray(payload.records)
        && payload.records.length===artifact.record_count;
      checks.push({file:artifact.file,ok,record_count:payload.records?.length??null,redacted:payload.redacted===true});
    }catch(error){
      checks.push({file:artifact.file,ok:false,error:String(error?.message||error)});
    }
  }
  return {checks,ok:checks.every(x=>x.ok&&x.redacted===true)};
}

export function rehearseGitRestore(backupDir,manifest,{spawnImpl=spawnSync}={}){
  const root=resolve(backupDir);
  const bundle=(manifest.artifacts||[]).find(x=>x.kind==="git_bundle");
  if(!bundle) return {skipped:true,ok:true,reason:"no_git_bundle"};
  const bundlePath=resolve(root,bundle.file);
  const work=mkdtempSync(resolve(tmpdir(),"hibou-restore-"));
  const cloneDir=resolve(work,"repo");
  try{
    const verify=spawnImpl("git",["bundle","verify",bundlePath],{encoding:"utf8"});
    if(verify.status!==0) return {skipped:false,ok:false,phase:"bundle_verify",error:String(verify.stderr||verify.stdout||"").trim()};
    const clone=spawnImpl("git",["clone",bundlePath,cloneDir],{encoding:"utf8"});
    if(clone.status!==0) return {skipped:false,ok:false,phase:"clone",error:String(clone.stderr||clone.stdout||"").trim()};
    const head=spawnImpl("git",["-C",cloneDir,"rev-parse","HEAD"],{encoding:"utf8"});
    const restored=String(head.stdout||"").trim();
    return {
      skipped:false,
      ok:head.status===0 && (!bundle.head || restored===bundle.head),
      expected_head:bundle.head||null,
      restored_head:restored||null,
      temp_root:basename(work),
    };
  }finally{
    rmSync(work,{recursive:true,force:true});
  }
}

export function rehearseBackup(backupDir,options={}){
  const integrity=verifyManifest(backupDir);
  if(!integrity.ok) return {schema:"HIBOU_RESTORE_REHEARSAL_V1",ok:false,integrity,airtable:null,git:null,writes_performed:false};
  const airtable=inspectSafeAirtableExports(backupDir,integrity.manifest);
  const git=rehearseGitRestore(backupDir,integrity.manifest,options);
  return {
    schema:"HIBOU_RESTORE_REHEARSAL_V1",
    ok:integrity.ok&&airtable.ok&&git.ok,
    integrity,
    airtable,
    git,
    writes_performed:false,
    airtable_restore_performed:false,
    note:"Rehearsal only: validates artifacts, parses safe exports and clones the git bundle locally. No Airtable write.",
  };
}

if(import.meta.url===`file://${process.argv[1]}`){
  const dir=process.argv[2];
  if(!dir) fail("usage: restore-rehearsal-local.mjs <backup_dir>");
  const result=rehearseBackup(dir);
  process.stdout.write(JSON.stringify(result,null,2)+"\n");
  if(!result.ok) process.exitCode=2;
}
