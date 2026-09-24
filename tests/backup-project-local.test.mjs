import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { backupRoot, decryptBuffer, encryptBuffer, exportAirtableTable, insideRepository, sanitizedPlan } from "../scripts/backup-project-local.mjs";

test("backup root refuses paths inside repository",()=>{
  assert.equal(insideRepository(process.cwd()),true);
  assert.throws(()=>backupRoot(resolve(process.cwd(),"backup")),/hors du dépôt Git/);
  const external=mkdtempSync(resolve(tmpdir(),"hibou-backup-"));
  assert.equal(backupRoot(external),resolve(external));
});

test("sensitive encryption round-trips and does not expose plaintext",()=>{
  const input=Buffer.from("client@example.com secret-ish payload");
  const encrypted=encryptBuffer(input,"correct horse battery staple");
  assert.equal(encrypted.includes(Buffer.from("client@example.com")),false);
  assert.deepEqual(decryptBuffer(encrypted,"correct horse battery staple"),input);
  assert.throws(()=>decryptBuffer(encrypted,"wrong password but long enough"),/authenticate|Unsupported state|unable/i);
});

test("sanitized plan never contains credentials",()=>{
  const plan=JSON.stringify(sanitizedPlan());
  assert.equal(plan.includes("AIRTABLE_TOKEN"),false);
  assert.equal(plan.includes("HIBOU_BACKUP_PASSPHRASE"),false);
  assert.equal(plan.includes("Social Credentials"),true);
});

test("Airtable export paginates without leaking the token into payload",async()=>{
  const calls=[];
  const fake=async(url,options)=>{
    calls.push({url:String(url),authorization:options.headers.Authorization});
    const page=calls.length===1
      ? {records:[{id:"rec1",fields:{Name:"A"}}],offset:"next"}
      : {records:[{id:"rec2",fields:{Name:"B"}}]};
    return new Response(JSON.stringify(page),{status:200,headers:{"Content-Type":"application/json"}});
  };
  const out=await exportAirtableTable("Roadmap","tblTest","token-never-write",fake);
  assert.equal(out.record_count,2);
  assert.equal(JSON.stringify(out).includes("token-never-write"),false);
  assert.equal(calls.length,2);
  assert.equal(calls.every(x=>x.authorization==="Bearer token-never-write"),true);
});


test("safe exports redact secret-like fields even outside sensitive tables",async()=>{
  const fake=async()=>new Response(JSON.stringify({records:[{id:"rec1",fields:{
    Name:"Visible",
    api_key:"should-not-leak",
    nested:{refresh_token:"hidden",value:"ok"}
  }}]}),{status:200,headers:{"Content-Type":"application/json"}});
  const out=await exportAirtableTable("Configuration","tblTest","token-never-write",fake);
  assert.equal(out.redacted,true);
  assert.equal(out.records[0].fields.Name,"Visible");
  assert.equal(out.records[0].fields.api_key,"[REDACTED]");
  assert.equal(out.records[0].fields.nested.refresh_token,"[REDACTED]");
  assert.equal(out.records[0].fields.nested.value,"ok");
});
