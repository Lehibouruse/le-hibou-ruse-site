import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { sanitizeRecord } from "../scripts/backup-airtable-local.mjs";
import { verifyBackup } from "../scripts/verify-airtable-backup.mjs";
import { buildRestorePlan } from "../scripts/plan-airtable-restore.mjs";
import { createHash } from "node:crypto";

function sha256(value){ return createHash("sha256").update(value).digest("hex"); }

test("backup redacts secret-looking fields and values",()=>{
  const out=sanitizeRecord({
    id:"rec123",createdTime:"2026-09-24T00:00:00.000Z",
    fields:{
      Name:"ok",
      api_key:"sk-supersecretvalue123456",
      Notes:"Bearer abcdefghijklmnopqrstuvwxyz",
      Nested:{password:"hunter2",safe:"visible"},
    }
  });
  assert.equal(out.fields.Name,"ok");
  assert.equal(out.fields.api_key,"[REDACTED]");
  assert.equal(out.fields.Notes,"[REDACTED]");
  assert.equal(out.fields.Nested.password,"[REDACTED]");
  assert.equal(out.fields.Nested.safe,"visible");
});

test("backup verifier catches hash/count drift",()=>{
  const dir=mkdtempSync(resolve(tmpdir(),"hibou-backup-"));
  const payload={
    schema:"HIBOU_AIRTABLE_BACKUP_TABLE_V1",
    exported_at:"2026-09-24T00:00:00.000Z",
    base_id:"app",
    table_name:"Livre",
    table_id:"tbl",
    record_count:1,
    records:[{id:"rec1",createdTime:"",fields:{Titre:"A"}}],
  };
  const text=JSON.stringify(payload,null,2)+"\n";
  writeFileSync(resolve(dir,"livre.json"),text);
  writeFileSync(resolve(dir,"manifest.json"),JSON.stringify({
    schema:"HIBOU_AIRTABLE_BACKUP_MANIFEST_V1",
    exported_at:payload.exported_at,
    base_id:"app",
    tables:[{table_name:"Livre",table_id:"tbl",file:"livre.json",record_count:1,sha256:sha256(text)}]
  }));
  const ok=verifyBackup(dir);
  assert.equal(ok.ok,true);
  writeFileSync(resolve(dir,"livre.json"),text.replace('"Titre": "A"','"Titre": "B"'));
  const bad=verifyBackup(dir);
  assert.equal(bad.ok,false);
  assert.equal(bad.results[0].hash_ok,false);
});

test("restore planner never enables blind production writes",()=>{
  const dir=mkdtempSync(resolve(tmpdir(),"hibou-restore-"));
  writeFileSync(resolve(dir,"manifest.json"),JSON.stringify({
    schema:"HIBOU_AIRTABLE_BACKUP_MANIFEST_V1",
    exported_at:"2026-09-24T00:00:00.000Z",
    base_id:"app",
    tables:[{table_name:"Livre",table_id:"tbl",file:"livre.json",record_count:2}]
  }));
  const plan=buildRestorePlan(dir);
  assert.equal(plan.destructive_restore_enabled,false);
  assert.equal(plan.target,"staging_base_required");
  assert.equal(plan.steps[0].automatic_write_allowed,false);
  assert.match(plan.steps[0].reason,/linked-record references/i);
});
