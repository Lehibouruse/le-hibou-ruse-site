import assert from "node:assert/strict";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { inspectSafeAirtableExports, rehearseBackup, verifyManifest } from "../scripts/restore-rehearsal-local.mjs";

const sha256=(buf)=>createHash("sha256").update(buf).digest("hex");

function fixture(){
  const root=mkdtempSync(resolve(tmpdir(),"hibou-backup-fixture-"));
  mkdirSync(resolve(root,"airtable"),{recursive:true});
  const payload={schema:"HIBOU_AIRTABLE_TABLE_BACKUP_V1",table:{name:"Roadmap",id:"tblRoadmap"},record_count:1,records:[{id:"rec1",fields:{Tâche:"X"}}],redacted:true};
  const body=gzipSync(Buffer.from(JSON.stringify(payload)));
  writeFileSync(resolve(root,"airtable","roadmap.json.gz"),body);
  const manifest={schema:"HIBOU_LOCAL_BACKUP_MANIFEST_V1",artifacts:[{file:"airtable/roadmap.json.gz",sha256:sha256(body),kind:"airtable",table_name:"Roadmap",table_id:"tblRoadmap",record_count:1,encrypted:false}]};
  writeFileSync(resolve(root,"manifest.json"),JSON.stringify(manifest));
  return root;
}

test("restore rehearsal verifies and parses safe Airtable exports without writes",()=>{
  const root=fixture();
  const v=verifyManifest(root);
  assert.equal(v.ok,true);
  const a=inspectSafeAirtableExports(root,v.manifest);
  assert.equal(a.ok,true);
  const result=rehearseBackup(root);
  assert.equal(result.ok,true);
  assert.equal(result.writes_performed,false);
  assert.equal(result.airtable_restore_performed,false);
  assert.equal(result.git.skipped,true);
});

test("tampered backup fails integrity before any restore action",()=>{
  const root=fixture();
  writeFileSync(resolve(root,"airtable","roadmap.json.gz"),Buffer.from("tampered"));
  const result=rehearseBackup(root);
  assert.equal(result.ok,false);
  assert.equal(result.writes_performed,false);
  assert.equal(result.airtable,null);
});
