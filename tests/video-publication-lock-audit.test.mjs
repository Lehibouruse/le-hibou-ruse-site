import assert from "node:assert/strict";
import test from "node:test";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import {
  auditPublicationLock,
  PUBLICATION_LOCK_AUDIT_SCHEMA,
} from "../scripts/video-publication-lock-audit.mjs";

function write(root, relative, value) {
  const path = join(root, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    typeof value === "string"
      ? value
      : JSON.stringify(value, null, 2),
    "utf8",
  );
}

test("clean V5 artifacts keep publication locked", () => {
  const root = mkdtempSync(join(tmpdir(), "hibou-publication-lock-"));
  try {
    write(root, "storyboard.json", {
      contract_version: "HIBOU_VIDEO_CONTRACT_V1",
      production: {
        mode: "preview",
        full_master_allowed: false,
        publication_authorized: false,
      },
    });
    write(root, "master-result.json", {
      schema: "HIBOU_VIDEO_MASTER_RESULT_V2",
      production_mode: "preview",
      preview_only: true,
      publication_authorized: false,
    });
    write(root, "artifact-registry.json", {
      schema: "HIBOU_VIDEO_ARTIFACT_REGISTRY_V2",
      preview_only: true,
      publication_authorized: false,
      entries: [
        {
          kind: "master",
          publication_authorized: false,
        },
      ],
    });
    write(root, "human-review.json", {
      schema: "HIBOU_HUMAN_REVIEW_PACKAGE_V1",
      human_approved: false,
      publication_authorized: false,
    });
    write(root, "_hibou_video_remote_repair_started.json", {
      schema: "HIBOU_VIDEO_REMOTE_REPAIR_STARTED_V1",
      publication_authorized: false,
    });

    const audit = auditPublicationLock(root);
    assert.equal(audit.schema, PUBLICATION_LOCK_AUDIT_SCHEMA);
    assert.equal(audit.status, "PASS");
    assert.equal(audit.violations.length, 0);
    assert.equal(audit.analysis_only, true);
    assert.equal(audit.filesystem_mutation_performed, false);
    assert.equal(audit.process_started, false);
    assert.equal(audit.publication_authorized, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("nested publication authorization fails closed", () => {
  const root = mkdtempSync(join(tmpdir(), "hibou-publication-true-"));
  try {
    write(root, "artifact-registry.json", {
      schema: "HIBOU_VIDEO_ARTIFACT_REGISTRY_V2",
      publication_authorized: false,
      entries: [
        {
          kind: "master",
          metadata: {
            publication_authorized: true,
          },
        },
      ],
    });

    const audit = auditPublicationLock(root);
    assert.equal(audit.status, "REJECT");
    const violation = audit.violations.find(
      (x) => x.code === "publication_authorized_true",
    );
    assert.equal(violation.relative_path, "artifact-registry.json");
    assert.match(violation.json_path, /publication_authorized$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("automatic publication signals fail closed", () => {
  const root = mkdtempSync(join(tmpdir(), "hibou-auto-publish-"));
  try {
    write(root, "master-result.json", {
      schema: "HIBOU_VIDEO_MASTER_RESULT_V2",
      auto_publish: true,
      publication_authorized: false,
    });

    const audit = auditPublicationLock(root);
    assert.equal(audit.status, "REJECT");
    assert.equal(
      audit.violations.some(
        (x) =>
          x.code === "automatic_publication_signal_true" &&
          x.key === "auto_publish",
      ),
      true,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("preview cannot allow a full master", () => {
  const root = mkdtempSync(join(tmpdir(), "hibou-preview-master-"));
  try {
    write(root, "storyboard.json", {
      contract_version: "HIBOU_VIDEO_CONTRACT_V1",
      production: {
        mode: "preview",
        full_master_allowed: true,
        publication_authorized: false,
      },
    });

    const audit = auditPublicationLock(root);
    assert.equal(audit.status, "REJECT");
    assert.equal(
      audit.violations.some(
        (x) => x.code === "preview_full_master_allowed",
      ),
      true,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("known unreadable JSON fails closed", () => {
  const root = mkdtempSync(join(tmpdir(), "hibou-bad-json-"));
  try {
    write(root, "human-review.json", "{not-json");
    const audit = auditPublicationLock(root);
    assert.equal(audit.status, "REJECT");
    assert.equal(
      audit.violations.some(
        (x) =>
          x.code === "json_artifact_unreadable" &&
          x.relative_path === "human-review.json",
      ),
      true,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("empty run root warns but never invents publication permission", () => {
  const root = mkdtempSync(join(tmpdir(), "hibou-empty-lock-"));
  try {
    const audit = auditPublicationLock(root);
    assert.equal(audit.status, "PASS");
    assert.equal(audit.scanned_file_count, 0);
    assert.equal(
      audit.warnings.some(
        (x) => x.code === "no_known_video_artifacts_found",
      ),
      true,
    );
    assert.equal(audit.publication_authorized, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
