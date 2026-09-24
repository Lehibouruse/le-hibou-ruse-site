import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { copyIndependentBackup, independentCopyPlan } from "../scripts/copy-backup-independent.mjs";

const sha=(b)=>createHash("sha256").update(b).digest("hex");

test("independent backup plan is dry-run and network free",()=>{
  const r=independentCopyPlan({source:"/tmp/source",destination:"/tmp/dest"});
  assert.equal(r.copy_performed,false);
  assert.equal(r.network_access,false);
});

test("independent copy verifies source and destination hashes",()=>{
  const root=mkdtempSync(resolve(tmpdir(),"hibou-copy-"));
  const source=resolve(root,"source","backup-1");
  const destination=resolve(root,"offsite");
  mkdirSync(source,{recursive:true});
  const artifact=Buffer.from("safe-backup-data");
  writeFileSync(resolve(source,"artifact.bin"),artifact);
  writeFileSync(resolve(source,"manifest.json"),JSON.stringify({
    schema:"HIBOU_LOCAL_BACKUP_MANIFEST_V1",
    artifacts:[{file:"artifact.bin",sha256:sha(artifact),kind:"test"}]
  }));
  const proof=copyIndependentBackup({source,destination});
  assert.equal(proof.source_verified,true);
  assert.equal(proof.destination_verified,true);
  const stored=JSON.parse(readFileSync(resolve(destination,"backup-1","independent-copy-proof.json"),"utf8"));
  assert.equal(stored.artifact_count,1);
  assert.equal(stored.secret_values_logged,false);
});

test("independent copy refuses overwrite",()=>{
  const root=mkdtempSync(resolve(tmpdir(),"hibou-copy-overwrite-"));
  const source=resolve(root,"source","backup-1");
  const destination=resolve(root,"offsite");
  mkdirSync(source,{recursive:true});
  mkdirSync(resolve(destination,"backup-1"),{recursive:true});
  const artifact=Buffer.from("x");
  writeFileSync(resolve(source,"artifact.bin"),artifact);
  writeFileSync(resolve(source,"manifest.json"),JSON.stringify({artifacts:[{file:"artifact.bin",sha256:sha(artifact)}]}));
  assert.throws(()=>copyIndependentBackup({source,destination}),/refus d'écraser/);
});
