import assert from "node:assert/strict";
import test from "node:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { inventoryMedia } from "../scripts/media-storage-inventory.mjs";

test("media inventory finds SHA-256 duplicates and never deletes",async()=>{
  const root=mkdtempSync(resolve(tmpdir(),"hibou-media-"));
  mkdirSync(resolve(root,"Renard"),{recursive:true});
  mkdirSync(resolve(root,"Furet"),{recursive:true});
  writeFileSync(resolve(root,"Renard","a.mp4"),Buffer.from("same-media"));
  writeFileSync(resolve(root,"Furet","copy.mp4"),Buffer.from("same-media"));
  writeFileSync(resolve(root,"Furet","unique.mp4"),Buffer.from("unique"));
  const r=await inventoryMedia(root,{hash:true});
  assert.equal(r.file_count,3);
  assert.equal(r.duplicate_groups.length,1);
  assert.equal(r.duplicate_groups[0].copies,2);
  assert.ok(r.potential_reclaim_bytes>0);
  assert.equal(r.deletion_performed,false);
  assert.equal(r.archive_performed,false);
  assert.equal(r.by_bucket.Renard.files,1);
  assert.equal(r.by_bucket.Furet.files,2);
});

test("quick inventory can skip hashing",async()=>{
  const root=mkdtempSync(resolve(tmpdir(),"hibou-media-fast-"));
  writeFileSync(resolve(root,"x.mp4"),Buffer.from("x"));
  const r=await inventoryMedia(root,{hash:false});
  assert.equal(r.hashing_enabled,false);
  assert.equal(r.files[0].sha256,null);
  assert.equal(r.duplicate_groups.length,0);
});
