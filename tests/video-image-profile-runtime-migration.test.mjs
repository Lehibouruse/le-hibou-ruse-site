import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const master = readFileSync(
  new URL("../scripts/video-master.mjs", import.meta.url),
  "utf8",
);
const plan = readFileSync(
  new URL("../scripts/video-image-plan.mjs", import.meta.url),
  "utf8",
);

test("image runtime bundle includes the verified ROG hardware profile by immutable commit", () => {
  assert.match(master, /rog-g814ji-rtx4070-8gb\.json/);
  assert.match(master, /video\/hardware\/rog-g814ji-rtx4070-8gb\.json/);
  assert.match(master, /for\(const \[name,marker,sourcePath\] of IMAGE_RUNTIME_FILES\)/);
  assert.match(master, /\$\{normalized\}\/\$\{sourcePath\}/);
});

test("image plan reads the bundled hardware profile next to the runtime", () => {
  assert.match(plan, /VERIFIED_HARDWARE_PROFILE="rog-g814ji-rtx4070-8gb\.json"/);
  assert.match(plan, /resolve\(PLAN_DIR,VERIFIED_HARDWARE_PROFILE\)/);
  assert.match(plan, /video\/hardware/);
});

test("legacy non-vertical profiles migrate instead of failing hard", () => {
  assert.match(plan, /legacy_non_vertical_profile/);
  assert.match(plan, /profile_migrated=true/);
  assert.doesNotMatch(plan, /primary image profile must be vertical 9:16-ish/);
});
