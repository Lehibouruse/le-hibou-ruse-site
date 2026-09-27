import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildRegistry } from "../scripts/video-artifact-registry.mjs";

const promoteSource = readFileSync(
  new URL("../scripts/video-storyboard-promote.mjs", import.meta.url),
  "utf8",
);
const masterSource = readFileSync(
  new URL("../scripts/video-master.mjs", import.meta.url),
  "utf8",
);

test("preview artifact registry can never authorize publication", () => {
  const root = mkdtempSync(join(tmpdir(), "hibou-preview-registry-"));
  try {
    const artifact = join(root, "master.mp4");
    writeFileSync(artifact, "preview-bytes");
    const registry = buildRegistry(
      [{ kind: "master", path: artifact, approved: true }],
      {
        production_mode: "preview",
        publication_authorized: true,
        human_review_required: true,
      },
    );

    assert.equal(registry.schema, "HIBOU_VIDEO_ARTIFACT_REGISTRY_V2");
    assert.equal(registry.production_mode, "preview");
    assert.equal(registry.preview_only, true);
    assert.equal(registry.publication_authorized, false);
    assert.equal(registry.entries[0].approved, true);
    assert.equal(registry.entries[0].preview_only, true);
    assert.equal(registry.entries[0].publication_authorized, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("render-ready preview contract is explicitly preview-only", () => {
  assert.match(promoteSource, /PREVIEW_RENDER_ONLY/);
  assert.match(promoteSource, /preview_only:previewOnly/);
  assert.match(promoteSource, /full_master_allowed:!previewOnly/);
  assert.match(promoteSource, /publication_authorized:false/);
});

test("master result and registry spec propagate preview-only state", () => {
  assert.match(masterSource, /HIBOU_VIDEO_ARTIFACT_REGISTRY_SPEC_V2/);
  assert.match(masterSource, /HIBOU_VIDEO_ARTIFACT_REGISTRY_V2/);
  assert.match(masterSource, /preview_only:String\(storyboardData\.production\?\.mode\|\|"final"\)\.toLowerCase\(\)==="preview"/);
  assert.match(masterSource, /publication_authorized:false/);
});
