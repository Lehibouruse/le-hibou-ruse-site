#!/usr/bin/env node
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const PUBLICATION_LOCK_AUDIT_SCHEMA =
  "HIBOU_VIDEO_PUBLICATION_LOCK_AUDIT_V1";

const KNOWN_RELATIVE_FILES = [
  "storyboard.json",
  "pipeline-run.json",
  "render-ready.json",
  "master-result.json",
  "master-qc.json",
  "creative-qc.json",
  "artifact-registry.json",
  "human-review.json",
  "review-diff.json",
  "incremental-retouch-plan.json",
  "durable-storage-plan.json",
  "images/candidate-review.json",
  "images/candidate-decisions.json",
];

const AUTO_PUBLISH_KEYS = new Set([
  "auto_publish",
  "automatic_publication",
  "publish_automatically",
  "publication_enabled",
]);

function fail(message) {
  throw new Error(message);
}

function jsonPath(parent, key) {
  if (!parent) return String(key);
  return Array.isArray(parent)
    ? `${parent}[${key}]`
    : `${parent}.${key}`;
}

function inspectValue(value, path = "$", findings = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      inspectValue(item, `${path}[${index}]`, findings),
    );
    return findings;
  }

  if (!value || typeof value !== "object") return findings;

  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}.${key}`;

    if (key === "publication_authorized" && child === true) {
      findings.push({
        code: "publication_authorized_true",
        json_path: childPath,
      });
    }

    if (AUTO_PUBLISH_KEYS.has(key) && child === true) {
      findings.push({
        code: "automatic_publication_signal_true",
        json_path: childPath,
        key,
      });
    }

    inspectValue(child, childPath, findings);
  }

  return findings;
}

function previewFullMasterViolation(value) {
  if (!value || typeof value !== "object") return false;

  const preview =
    value.preview_only === true ||
    String(value.production_mode || value?.production?.mode || "")
      .trim()
      .toLowerCase() === "preview";

  const fullMasterAllowed =
    value.full_master_allowed === true ||
    value?.production?.full_master_allowed === true;

  if (preview && fullMasterAllowed) return true;

  if (Array.isArray(value)) {
    return value.some(previewFullMasterViolation);
  }

  return Object.values(value).some(previewFullMasterViolation);
}

function rootHibouJsonFiles(root) {
  if (!existsSync(root)) return [];
  try {
    return readdirSync(root)
      .filter((name) => /^_hibou_video_.*\.json$/i.test(name))
      .map((name) => name);
  } catch {
    return [];
  }
}

function candidateFiles(root) {
  return [
    ...KNOWN_RELATIVE_FILES,
    ...rootHibouJsonFiles(root),
  ];
}

export function auditPublicationLock(rootArg) {
  if (!String(rootArg || "").trim()) fail("render root required");
  const root = resolve(String(rootArg));
  if (!existsSync(root)) fail("render root missing");

  const files = [];
  const violations = [];
  const warnings = [];

  for (const relative of [...new Set(candidateFiles(root))]) {
    const path = resolve(root, relative);
    if (!path.startsWith(root)) {
      violations.push({
        code: "artifact_path_escaped_root",
        relative_path: relative,
      });
      continue;
    }
    if (!existsSync(path)) continue;

    let sizeBytes = 0;
    try {
      sizeBytes = statSync(path).size;
    } catch {
      violations.push({
        code: "artifact_stat_failed",
        relative_path: relative,
      });
      continue;
    }

    if (sizeBytes > 5 * 1024 * 1024) {
      violations.push({
        code: "json_artifact_too_large_for_lock_audit",
        relative_path: relative,
        size_bytes: sizeBytes,
      });
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(readFileSync(path, "utf8"));
    } catch (error) {
      violations.push({
        code: "json_artifact_unreadable",
        relative_path: relative,
        error: String(error?.message || error).slice(0, 500),
      });
      continue;
    }

    const fileFindings = inspectValue(parsed);
    for (const finding of fileFindings) {
      violations.push({
        ...finding,
        relative_path: relative,
      });
    }

    if (previewFullMasterViolation(parsed)) {
      violations.push({
        code: "preview_full_master_allowed",
        relative_path: relative,
      });
    }

    files.push({
      relative_path: relative,
      size_bytes: sizeBytes,
      publication_violation_count:
        fileFindings.length +
        (previewFullMasterViolation(parsed) ? 1 : 0),
    });
  }

  if (!files.length) {
    warnings.push({
      code: "no_known_video_artifacts_found",
    });
  }

  const status = violations.length ? "REJECT" : "PASS";

  return {
    schema: PUBLICATION_LOCK_AUDIT_SCHEMA,
    root,
    status,
    scanned_file_count: files.length,
    files,
    violations,
    warnings,
    analysis_only: true,
    filesystem_mutation_performed: false,
    process_started: false,
    human_review_required: true,
    publication_authorized: false,
    policy: {
      publication_true_fails_closed: true,
      automatic_publish_signals_fail_closed: true,
      preview_full_master_fails_closed: true,
      unreadable_known_json_fails_closed: true,
      audit_never_authorizes_publication: true,
    },
  };
}

if (import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [rootArg] = process.argv.slice(2);
  const report = auditPublicationLock(rootArg);
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
  if (report.status !== "PASS") process.exitCode = 2;
}
