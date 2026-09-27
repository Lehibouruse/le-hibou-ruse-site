import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const starter = readFileSync(new URL("../scripts/video-start-comfyui-windows.ps1", import.meta.url), "utf8");

test("ComfyUI starter auto-repairs CUDA runtime to a driver-compatible cu124 stack", () => {
  assert.match(starter, /torch==2\.6\.0/);
  assert.match(starter, /torchvision==0\.21\.0/);
  assert.match(starter, /torchaudio==2\.6\.0/);
  assert.match(starter, /download\.pytorch\.org\/whl\/cu124/);
  assert.match(starter, /torch\.cuda\.is_available\(\)/);
  assert.match(starter, /CUDA reste indisponible apres reparation PyTorch cu124/);
  assert.match(starter, /--disable-xformers/);
  assert.match(starter, /--use-pytorch-cross-attention/);
});
