#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function sha256(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function verifyBackup(root) {
  const dir = resolve(root);
  const manifest = JSON.parse(readFileSync(resolve(dir, "manifest.json"), "utf8"));
  const checks = (manifest.files || []).map((entry) => {
    const actual = sha256(resolve(dir, entry.file));
    return { file: entry.file, expected: entry.sha256, actual, ok: actual === entry.sha256 };
  });
  return {
    schema: "HIBOU_BACKUP_VERIFY_V1",
    ok: checks.length > 0 && checks.every((item) => item.ok),
    manifest_schema: manifest.schema,
    checks,
    restore_performed: false,
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const root = process.argv[2];
  if (!root) throw new Error("usage: verify-hibou-backup.mjs <backup_dir>");
  process.stdout.write(JSON.stringify(verifyBackup(root), null, 2) + "\n");
}
