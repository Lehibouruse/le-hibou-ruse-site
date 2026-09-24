import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const installer=readFileSync(new URL("../scripts/video-local-install-windows.ps1",import.meta.url),"utf8");
const starter=readFileSync(new URL("../scripts/video-start-comfyui-windows.ps1",import.meta.url),"utf8");

test("video local installer defaults to diagnostic-only",()=>{
  assert.match(installer,/Diagnostic uniquement\. Aucun paquet, modèle ou service n'a été installé\/démarré/);
  assert.match(installer,/if \(-not \(\$InstallVoice -or \$InstallComfyUI -or \$InstallFluxSchnell -or \$StartComfyUI\)\)/);
});

test("heavy installs require explicit switches and preflight",()=>{
  assert.match(installer,/if \(\$InstallVoice\)/);
  assert.match(installer,/if \(\$InstallComfyUI\)/);
  assert.match(installer,/if \(\$InstallFluxSchnell\)/);
  assert.match(installer,/Require-GpuAndDisk 30/);
  assert.doesNotMatch(installer,/InstallFluxSchnell\s*=\s*\$true/);
});

test("Chatterbox is pinned and CUDA is mandatory",()=>{
  assert.match(installer,/ChatterboxVersion = "0\.1\.7"/);
  assert.match(installer,/TorchVersion = "2\.6\.0"/);
  assert.match(installer,/download\.pytorch\.org\/whl\/cu124/);
  assert.match(installer,/torch\.cuda\.is_available/);
  assert.match(installer,/Aucun fallback CPU\/cloud n'est autorisé/);
});

test("ComfyUI only starts on loopback and low-vram mode",()=>{
  assert.match(starter,/--listen 127\.0\.0\.1/);
  assert.match(starter,/--lowvram/);
  assert.doesNotMatch(starter,/0\.0\.0\.0/);
});

test("FLUX download is explicit and SHA-256 verified",()=>{
  assert.match(installer,/flux1-schnell-fp8\.safetensors/);
  assert.match(installer,/ead426278b49030e9da5df862994f25ce94ab2ee4df38b556ddddb3db093bf72/);
  assert.match(installer,/Get-FileHash -Algorithm SHA256/);
  assert.match(installer,/SHA-256 FLUX invalide\. Fichier supprimé/);
});

test("installer records no paid fallback or automatic start",()=>{
  assert.match(installer,/paid_fallback = \$false/);
  assert.match(installer,/automatic_model_download = \$false/);
  assert.match(installer,/automatic_service_start = \$false/);
});
