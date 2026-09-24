#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { basename, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { queryAllRecords, TABLES } from "../lib/airtable.js";

export const SAFE_TABLES = Object.freeze({
  cms: TABLES.cms,
  articles: TABLES.articles,
  products: TABLES.products,
  configuration: TABLES.configuration,
  montages: TABLES.montages,
  book: TABLES.book,
  content: TABLES.content,
  videoScenes: TABLES.videoScenes,
  videoProfiles: TABLES.videoProfiles,
  benchmark: TABLES.benchmark,
  legal: TABLES.legal,
  socialAccounts: TABLES.socialAccounts,
  socialPerformance: TABLES.socialPerformance,
  growthExperiments: TABLES.growthExperiments,
});

export const EXCLUDED_TABLES = Object.freeze([
  "leads",
  "sales",
  "withdrawals",
  "jobs",
  "journal",
  "socialCredentials",
  "conversionEvents",
]);

const SENSITIVE_NAME = /(secret|token|password|authorization|cookie|credential|api[ _-]?key|clé[ _-]?api|access[ _-]?token|refresh[ _-]?token)/i;

function sha256Buffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function safeJson(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

export function sanitizeValue(fieldName, value) {
  if (SENSITIVE_NAME.test(String(fieldName || ""))) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((item) => sanitizeValue(fieldName, item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, sanitizeValue(key, child)]));
  }
  return value;
}

export function sanitizeRecord(tableName, record) {
  const fields = Object.fromEntries(
    Object.entries(record?.fields || {}).map(([field, value]) => [field, sanitizeValue(field, value)]),
  );
  if (tableName === "configuration") {
    const key = String(fields["Clé"] ?? fields.key ?? "");
    if (SENSITIVE_NAME.test(key) && Object.prototype.hasOwnProperty.call(fields, "Valeur")) {
      fields.Valeur = "[REDACTED]";
    }
  }
  return {
    id: record?.id || "",
    createdTime: record?.createdTime || null,
    fields,
  };
}

export function backupPlan() {
  return {
    schema: "HIBOU_SAFE_BACKUP_PLAN_V1",
    safe_tables: Object.keys(SAFE_TABLES),
    excluded_tables: [...EXCLUDED_TABLES],
    secrets_policy: "Never export socialCredentials/leads/sales/withdrawals; redact suspicious field/key names.",
    git_bundle: true,
    library_files: "not_exported_by_this_script",
  };
}

function gitBundle(destination) {
  const result = spawnSync("git", ["bundle", "create", destination, "--all"], {
    encoding: "utf8",
    windowsHide: true,
    shell: false,
  });
  if (result.status !== 0) {
    throw new Error(`git bundle failed: ${String(result.stderr || result.stdout || "").trim()}`);
  }
}

function parseArgs(argv) {
  return {
    create: argv.includes("--create"),
    noGit: argv.includes("--no-git-bundle"),
    root: argv.find((x) => x.startsWith("--root="))?.slice("--root=".length) || "",
  };
}

export async function createSafeBackup({ root, includeGit = true, fetchTable = queryAllRecords } = {}) {
  if (!process.env.AIRTABLE_TOKEN) throw new Error("AIRTABLE_TOKEN absent");
  const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const baseRoot = resolve(root || process.env.HIBOU_BACKUP_ROOT || resolve(homedir(), "HibouBackups"));
  const out = resolve(baseRoot, `hibou-backup-${stamp}`);
  mkdirSync(out, { recursive: true });

  const files = [];
  for (const [name, tableId] of Object.entries(SAFE_TABLES)) {
    const records = await fetchTable(tableId, {}, { maxPages: 50, maxRecords: 5000 });
    const payload = {
      schema: "HIBOU_AIRTABLE_SAFE_EXPORT_V1",
      exported_at: new Date().toISOString(),
      table: name,
      table_id: tableId,
      count: records.length,
      records: records.map((record) => sanitizeRecord(name, record)),
    };
    const filename = `airtable-${name}.json`;
    const body = Buffer.from(safeJson(payload), "utf8");
    writeFileSync(resolve(out, filename), body);
    files.push({ file: filename, bytes: body.length, sha256: sha256Buffer(body), records: records.length });
  }

  if (includeGit) {
    const filename = "repository.bundle";
    gitBundle(resolve(out, filename));
    const body = readFileSync(resolve(out, filename));
    files.push({ file: filename, bytes: body.length, sha256: sha256Buffer(body) });
  }

  const manifest = {
    schema: "HIBOU_BACKUP_MANIFEST_V1",
    created_at: new Date().toISOString(),
    backup_dir: basename(out),
    safe_tables: Object.keys(SAFE_TABLES),
    excluded_tables: [...EXCLUDED_TABLES],
    files,
    library_files_included: false,
    restore_automatic: false,
  };
  const manifestBody = Buffer.from(safeJson(manifest), "utf8");
  writeFileSync(resolve(out, "manifest.json"), manifestBody);
  return { out, manifest };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const args = parseArgs(process.argv.slice(2));
  if (!args.create) {
    process.stdout.write(safeJson({
      mode: "dry_run",
      ...backupPlan(),
      default_root: resolve(homedir(), "HibouBackups"),
      action: "Re-run with --create after confirming AIRTABLE_TOKEN and backup destination.",
    }));
    process.exit(0);
  }
  const result = await createSafeBackup({ root: args.root, includeGit: !args.noGit });
  process.stdout.write(safeJson({ ok: true, backup_dir: result.out, manifest: result.manifest }));
}
