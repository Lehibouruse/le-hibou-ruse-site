import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { EXCLUDED_TABLES, SAFE_TABLES, backupPlan, sanitizeRecord, sanitizeValue } from "../scripts/backup-hibou-safe.mjs";
import { verifyBackup } from "../scripts/verify-hibou-backup.mjs";

test("safe backup excludes PII and credential tables by policy",()=>{
  for(const name of ["leads","sales","withdrawals","socialCredentials","conversionEvents"]){
    assert.ok(EXCLUDED_TABLES.includes(name));
    assert.equal(Object.prototype.hasOwnProperty.call(SAFE_TABLES,name),false);
  }
});

test("suspicious fields and configuration keys are redacted",()=>{
  assert.equal(sanitizeValue("access_token","abc"),"[REDACTED]");
  const record=sanitizeRecord("configuration",{id:"rec1",fields:{"Clé":"reddit_access_token","Valeur":"secret","Actif":true}});
  assert.equal(record.fields.Valeur,"[REDACTED]");
  assert.equal(record.fields.Actif,true);
});

test("ordinary content is preserved",()=>{
  const record=sanitizeRecord("montages",{id:"rec1",fields:{Montage:"Donation-cession",Notes:"Texte public"}});
  assert.equal(record.fields.Montage,"Donation-cession");
  assert.equal(record.fields.Notes,"Texte public");
});

test("dry-run plan never claims Library files or restore",()=>{
  const plan=backupPlan();
  assert.equal(plan.library_files,"not_exported_by_this_script");
  assert.ok(plan.excluded_tables.includes("socialCredentials"));
});

test("backup verifier detects intact and corrupted files",()=>{
  const root=mkdtempSync(resolve(tmpdir(),"hibou-backup-test-"));
  const body=Buffer.from("hello","utf8");
  writeFileSync(resolve(root,"a.json"),body);
  const hash=createHash("sha256").update(body).digest("hex");
  writeFileSync(resolve(root,"manifest.json"),JSON.stringify({schema:"HIBOU_BACKUP_MANIFEST_V1",files:[{file:"a.json",sha256:hash}]}));
  assert.equal(verifyBackup(root).ok,true);
  writeFileSync(resolve(root,"a.json"),"changed");
  assert.equal(verifyBackup(root).ok,false);
});
