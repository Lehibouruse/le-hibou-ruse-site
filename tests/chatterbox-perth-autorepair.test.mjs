import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const voice = readFileSync(
  new URL("../scripts/chatterbox-storyboard-batch.py", import.meta.url),
  "utf8",
);

test("voice runtime detects missing Perth watermarker before loading Chatterbox", () => {
  assert.match(voice, /def ensure_perth_watermarker\(\):/);
  assert.match(voice, /getattr\(perth, "PerthImplicitWatermarker", None\)/);
  assert.match(voice, /if callable\(watermarker\):/);
  assert.match(voice, /ensure_perth_watermarker\(\)/);
});

test("voice runtime repairs Perth by pinning setuptools below 81 once", () => {
  assert.match(voice, /"setuptools<81"/);
  assert.match(voice, /HIBOU_PERTH_REPAIR_ATTEMPTED/);
  assert.match(voice, /HIBOU_PERTH_REPAIR_START/);
  assert.match(voice, /HIBOU_PERTH_REPAIR_RESTART/);
  assert.match(voice, /restart = subprocess\.run\(/);
  assert.match(voice, /\[sys\.executable, \*sys\.argv\]/);
  assert.match(voice, /raise SystemExit\(restart\.returncode\)/);
  assert.doesNotMatch(voice, /os\.execve\(/);
});

test("voice runtime fails closed if Perth repair does not succeed", () => {
  assert.match(voice, /Automatic Perth repair failed/);
  assert.match(voice, /still unavailable after automatic setuptools repair/);
  assert.doesNotMatch(voice, /DummyWatermarker\(\)/);
});
