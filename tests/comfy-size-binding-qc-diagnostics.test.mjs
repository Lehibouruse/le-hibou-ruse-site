import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const factory = readFileSync(
  new URL("../scripts/video-image-factory.mjs", import.meta.url),
  "utf8",
);
const plan = readFileSync(
  new URL("../scripts/video-image-plan.mjs", import.meta.url),
  "utf8",
);
const hardware = JSON.parse(readFileSync(
  new URL("../video/hardware/rog-g814ji-rtx4070-8gb.json", import.meta.url),
  "utf8",
));

test("canonical ROG image profile defines primary and local fallback sizes", () => {
  assert.equal(hardware.image.smoke_profile.width, 768);
  assert.equal(hardware.image.smoke_profile.height, 1344);
  assert.equal(hardware.image.fallback_profile.width, 640);
  assert.equal(hardware.image.fallback_profile.height, 1136);
  assert.equal(hardware.policy.paid_cloud_fallback, false);
  assert.equal(hardware.policy.publication_authorized, false);
});

test("image factory derives technical QC floor from authorized profiles", () => {
  assert.match(factory, /function qcOptionsFromPlan/);
  assert.match(factory, /Math\.max\(512,Math\.min\(\.\.\.widths\)\)/);
  assert.match(factory, /Math\.max\(896,Math\.min\(\.\.\.heights\)\)/);
  assert.match(factory, /aspectTolerance:0\.05/);
});

test("image factory preserves aggregate QC diagnostics while adding profile metadata", () => {
  assert.match(factory, /image_profile:\{/);
  assert.match(factory, /size_binding_repaired/);
  assert.match(factory, /failed_check_counts:tech\?\.failed_check_counts\|\|\{\}/);
  assert.match(factory, /dimensions:aggregateDimensions\(tech\)/);
  assert.match(factory, /perceptual_qc:aggregatePerceptual\(perceptual\)/);
  assert.match(factory, /reason_counts/);
  assert.match(factory, /warning_counts/);
  assert.match(factory, /qc_options:qcOptions/);
});

test("image plan repairs missing size binding and migrates stale profiles", () => {
  assert.match(plan, /function discoverSizeNode/);
  assert.match(plan, /ComfyUI workflow has no controllable width\/height node/);
  assert.match(plan, /size_binding_repaired/);
  assert.match(plan, /legacy_non_vertical_profile/);
  assert.match(plan, /profile_migrated/);
  assert.match(plan, /verifiedHardwareProfiles/);
});
