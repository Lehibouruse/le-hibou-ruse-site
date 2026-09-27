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


test("CUDA probe tolerates expected torch stderr warnings under Windows PowerShell 5.1", () => {
  assert.match(starter, /\$previousErrorActionPreference = \$ErrorActionPreference/);
  assert.match(starter, /\$ErrorActionPreference = "Continue"/);
  assert.match(starter, /2>\$null/);
  assert.match(starter, /\$ErrorActionPreference = \$previousErrorActionPreference/);
});


test("pip CUDA repair tolerates harmless stderr warnings under Windows PowerShell 5.1", () => {
  assert.match(starter, /\$ErrorActionPreference = "Continue"/);
  assert.match(starter, /Tee-Object -FilePath \$CudaRepairLog -Append/);
  assert.match(starter, /\$pipExit = \$LASTEXITCODE/);
  assert.match(starter, /if \(\$pipExit -ne 0\)/);
});


test("CUDA repair removes stale embedded torch packages before reinstall", () => {
  assert.match(starter, /Remove-ComfyTorchResidue/);
  assert.match(starter, /"torch-\*\.dist-info"/);
  assert.match(starter, /"torchvision-\*\.dist-info"/);
  assert.match(starter, /"torchaudio-\*\.dist-info"/);
  assert.match(starter, /"~ympy\*"/);
  assert.match(starter, /--no-warn-script-location/);
  assert.match(starter, /Impossible de supprimer le paquet PyTorch critique/);
});


test("long-path torch metadata cleanup cannot block critical package repair", () => {
  assert.match(starter, /criticalNames = @\("torch", "torchvision", "torchaudio", "functorch", "torchgen"\)/);
  assert.match(starter, /shutil\.rmtree\(sys\.argv\[1\], ignore_errors=True\)/);
  assert.match(starter, /metadata residue kept/);
  assert.match(starter, /Impossible de supprimer le paquet PyTorch critique/);
});


test("CUDA probe captures Python stdout and stderr without PowerShell native-error swallowing", () => {
  assert.match(starter, /comfyui-cuda-probe\.py/);
  assert.match(starter, /RedirectStandardOutput \$probeStdout/);
  assert.match(starter, /RedirectStandardError \$probeStderr/);
  assert.match(starter, /device_count/);
  assert.match(starter, /STDERR=\$\(\$cudaProbe\.stderr\)/);
});


test("CUDA probe handles empty stdout or stderr files under PowerShell 5.1", () => {
  assert.match(starter, /\$null -eq \$probeOutputRaw/);
  assert.match(starter, /\$null -eq \$probeErrorRaw/);
  assert.match(starter, /\$probeOutput = \$probeOutput\.Trim\(\)/);
  assert.match(starter, /\$probeError = \$probeError\.Trim\(\)/);
});


test("ComfyUI starter patches comfy-kitchen builtin list annotations for torch 2.6", () => {
  assert.match(starter, /Patch-ComfyKitchenTorch26/);
  assert.match(starter, /list\[int\].*typing\.List\[int\]/s);
  assert.match(starter, /list\[bool\].*typing\.List\[bool\]/s);
  assert.match(starter, /HIBOU_COMFY_KITCHEN_TORCH26_PATCH_V1/);
  assert.match(starter, /comfy_kitchen_import_ok/);
  assert.match(starter, /comfy_kitchen reste incompatible avec torch 2\.6 apres patch/);
});


test("comfy-kitchen import validation uses a Python file to avoid Windows quoting issues", () => {
  assert.match(starter, /comfy-kitchen-import-probe\.py/);
  assert.match(starter, /Set-Content -LiteralPath \$importProbe -Encoding UTF8/);
  assert.match(starter, /ArgumentList @\("-s", \$importProbe\)/);
});
