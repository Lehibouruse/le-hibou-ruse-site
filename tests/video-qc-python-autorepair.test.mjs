import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const factory = readFileSync(
  new URL("../scripts/video-image-factory.mjs", import.meta.url),
  "utf8",
);

test("image QC uses an isolated Hibou venv on Windows", () => {
  assert.match(factory, /LeHibou","video","qc","venv/);
  assert.match(factory, /Scripts","python\.exe/);
  assert.match(factory, /Create isolated Hibou QC venv/);
});

test("image QC auto-installs bounded OpenCV and NumPy dependencies", () => {
  assert.match(factory, /"numpy<2"/);
  assert.match(factory, /"opencv-python-headless==4\.10\.0\.84"/);
  assert.match(factory, /Install isolated Hibou QC dependencies/);
  assert.match(factory, /import cv2, numpy/);
});

test("image QC script resolves from the isolated runtime bundle directory", () => {
  assert.match(factory, /const SCRIPT_DIR=dirname\(fileURLToPath\(import\.meta\.url\)\)/);
  assert.match(factory, /resolve\(SCRIPT_DIR,"video-image-perceptual-qc\.py"\)/);
  assert.doesNotMatch(factory, /resolve\("scripts\/video-image-perceptual-qc\.py"\)/);
});

test("explicit HIBOU_QC_PYTHON must already contain QC dependencies", () => {
  assert.match(factory, /HIBOU_QC_PYTHON dependency probe/);
});
