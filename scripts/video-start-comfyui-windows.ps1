param(
  [int]$Port = 8188
)

# COMFYUI_AUTOSTART_V2
$ErrorActionPreference = "Stop"
$VideoRoot = Join-Path $env:LOCALAPPDATA "LeHibou\video"
$Portable = Join-Path $VideoRoot "comfyui\ComfyUI_windows_portable"
$Python = Join-Path $Portable "python_embeded\python.exe"
$Main = Join-Path $Portable "ComfyUI\main.py"
$SitePackages = Join-Path $Portable "python_embeded\Lib\site-packages"
$LogDir = Join-Path $env:LOCALAPPDATA "LeHibou\logs"
$Stdout = Join-Path $LogDir "comfyui-autostart.stdout.log"
$Stderr = Join-Path $LogDir "comfyui-autostart.stderr.log"
$State = Join-Path $LogDir "comfyui-autostart-state.json"
$CudaRepairLog = Join-Path $LogDir "comfyui-cuda-repair.log"

if (-not (Test-Path $Python) -or -not (Test-Path $Main)) {
  throw "ComfyUI portable Hibou introuvable. Lancer d'abord video-local-install-windows.ps1 -InstallComfyUI."
}
if ($Port -lt 1024 -or $Port -gt 65535) { throw "Port invalide." }
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

# Stop only stale ComfyUI processes from this Hibou portable install before touching torch DLLs.
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object {
    $_.Name -match '^python(\.exe)?$' -and
    $_.CommandLine -like "*ComfyUI\main.py*" -and
    $_.CommandLine -like "*$Portable*"
  } |
  ForEach-Object {
    try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {}
  }

function Test-ComfyCuda {
  $probeCode = @'
import json, sys
import torch
ok = bool(torch.cuda.is_available())
print(json.dumps({
    "python": sys.version,
    "torch": str(torch.__version__),
    "torch_file": str(torch.__file__),
    "cuda_runtime": str(torch.version.cuda),
    "cuda_available": ok,
    "device_count": int(torch.cuda.device_count()),
    "device": torch.cuda.get_device_name(0) if ok else None,
}))
raise SystemExit(0 if ok else 3)
'@

  $probeScript = Join-Path $LogDir "comfyui-cuda-probe.py"
  $probeStdout = Join-Path $LogDir "comfyui-cuda-probe.stdout.log"
  $probeStderr = Join-Path $LogDir "comfyui-cuda-probe.stderr.log"

  $probeCode | Set-Content -LiteralPath $probeScript -Encoding UTF8
  Remove-Item -LiteralPath $probeStdout -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $probeStderr -Force -ErrorAction SilentlyContinue

  $probeProcess = Start-Process -FilePath $Python -ArgumentList @("-s", $probeScript) -WorkingDirectory $Portable -RedirectStandardOutput $probeStdout -RedirectStandardError $probeStderr -WindowStyle Hidden -Wait -PassThru

  $probeOutputRaw = if (Test-Path -LiteralPath $probeStdout) { Get-Content -LiteralPath $probeStdout -Raw } else { "" }
  $probeErrorRaw = if (Test-Path -LiteralPath $probeStderr) { Get-Content -LiteralPath $probeStderr -Raw } else { "" }
  $probeOutput = if ($null -eq $probeOutputRaw) { "" } else { [string]$probeOutputRaw }
  $probeError = if ($null -eq $probeErrorRaw) { "" } else { [string]$probeErrorRaw }
  $probeOutput = $probeOutput.Trim()
  $probeError = $probeError.Trim()

  return [ordered]@{
    ok = ($probeProcess.ExitCode -eq 0)
    exit_code = $probeProcess.ExitCode
    output = $probeOutput
    stderr = $probeError
  }
}

function Remove-ComfyTorchResidue {
  $patterns = @(
    "torch",
    "torch-*.dist-info",
    "torchvision",
    "torchvision-*.dist-info",
    "torchaudio",
    "torchaudio-*.dist-info",
    "functorch",
    "torchgen",
    "~orch*",
    "~unctorch*",
    "~ympy*"
  )
  $criticalNames = @("torch", "torchvision", "torchaudio", "functorch", "torchgen")

  foreach ($pattern in $patterns) {
    Get-ChildItem -LiteralPath $SitePackages -Force -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -like $pattern } |
      ForEach-Object {
        $target = $_.FullName
        $name = $_.Name
        $critical = $criticalNames -contains $name
        $removed = $false

        for ($attempt = 1; $attempt -le 2 -and -not $removed; $attempt++) {
          try {
            Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction Stop
            $removed = $true
          } catch {
            Start-Sleep -Milliseconds (500 * $attempt)
          }
        }

        if (-not $removed -and (Test-Path -LiteralPath $target)) {
          # Fallback for deep Windows package metadata paths left by the portable build.
          $extendedTarget = if ($target.StartsWith("\\?\")) { $target } else { "\\?\$target" }
          $cleanupCode = "import shutil,sys; shutil.rmtree(sys.argv[1], ignore_errors=True)"
          $previousErrorActionPreference = $ErrorActionPreference
          $ErrorActionPreference = "Continue"
          try {
            & $Python -c $cleanupCode $extendedTarget 2>$null
          } finally {
            $ErrorActionPreference = $previousErrorActionPreference
          }
          $removed = -not (Test-Path -LiteralPath $target)
        }

        if (-not $removed -and $critical) {
          throw "Impossible de supprimer le paquet PyTorch critique: $target"
        }
        if (-not $removed) {
          ("[{0}] warning: metadata residue kept: {1}" -f ([DateTimeOffset]::UtcNow.ToString("o")), $target) |
            Add-Content -Path $CudaRepairLog -Encoding UTF8
        }
      }
  }
}

$cudaProbe = Test-ComfyCuda
if (-not $cudaProbe.ok) {
  Write-Host "CUDA PyTorch ComfyUI indisponible; reparation automatique vers torch 2.6.0 + cu124..." -ForegroundColor Yellow
  ("[{0}] probe before repair: stdout={1}; stderr={2}; exit={3}" -f ([DateTimeOffset]::UtcNow.ToString("o")), $cudaProbe.output, $cudaProbe.stderr, $cudaProbe.exit_code) | Add-Content -Path $CudaRepairLog -Encoding UTF8

  Remove-ComfyTorchResidue

  $pipArgs = @(
    "-m", "pip", "install",
    "--disable-pip-version-check",
    "--no-input",
    "--no-warn-script-location",
    "--upgrade",
    "--force-reinstall",
    "torch==2.6.0",
    "torchvision==0.21.0",
    "torchaudio==2.6.0",
    "--index-url", "https://download.pytorch.org/whl/cu124"
  )

  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    & $Python @pipArgs *>&1 | Tee-Object -FilePath $CudaRepairLog -Append
    $pipExit = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  if ($pipExit -ne 0) {
    throw "Reparation PyTorch CUDA 12.4 echouee. Voir $CudaRepairLog"
  }

  $cudaProbe = Test-ComfyCuda
  ("[{0}] probe after repair: stdout={1}; stderr={2}; exit={3}" -f ([DateTimeOffset]::UtcNow.ToString("o")), $cudaProbe.output, $cudaProbe.stderr, $cudaProbe.exit_code) | Add-Content -Path $CudaRepairLog -Encoding UTF8
  if (-not $cudaProbe.ok) {
    throw "CUDA reste indisponible apres reparation PyTorch cu124. Exit=$($cudaProbe.exit_code) STDOUT=$($cudaProbe.output) STDERR=$($cudaProbe.stderr)"
  }
}

Write-Host ("CUDA ComfyUI OK : {0}" -f $cudaProbe.output) -ForegroundColor Green

function Patch-ComfyKitchenTorch26 {
  $kitchenRoot = Join-Path $SitePackages "comfy_kitchen"
  if (-not (Test-Path -LiteralPath $kitchenRoot)) { return }

  $patchScript = Join-Path $LogDir "patch-comfy-kitchen-torch26.py"
  $patchReport = Join-Path $LogDir "patch-comfy-kitchen-torch26.json"

  @'
import json
import sys
from pathlib import Path

root = Path(sys.argv[1])
report_path = Path(sys.argv[2])
replacements = {
    "list[int]": "typing.List[int]",
    "list[bool]": "typing.List[bool]",
    "list[float]": "typing.List[float]",
    "list[str]": "typing.List[str]",
}
changed = []

for path in root.rglob("*.py"):
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        continue

    updated = text
    for old, new in replacements.items():
        updated = updated.replace(old, new)

    if updated == text:
        continue

    if "import typing" not in updated:
        lines = updated.splitlines()
        future_positions = [
            i for i, line in enumerate(lines)
            if line.startswith("from __future__ import ")
        ]
        insert_at = max(future_positions) + 1 if future_positions else 0
        lines.insert(insert_at, "import typing")
        updated = "\n".join(lines)
        if text.endswith("\n"):
            updated += "\n"

    path.write_text(updated, encoding="utf-8")
    changed.append(str(path))

report = {
    "schema": "HIBOU_COMFY_KITCHEN_TORCH26_PATCH_V1",
    "root": str(root),
    "changed_count": len(changed),
    "changed_files": changed,
}
report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")
print(json.dumps(report))
'@ | Set-Content -LiteralPath $patchScript -Encoding UTF8

  $patchProcess = Start-Process -FilePath $Python -ArgumentList @("-s", $patchScript, $kitchenRoot, $patchReport) -WorkingDirectory $Portable -WindowStyle Hidden -Wait -PassThru
  if ($patchProcess.ExitCode -ne 0) {
    throw "Patch comfy-kitchen / torch 2.6 echoue avec code $($patchProcess.ExitCode)"
  }

  $importStdout = Join-Path $LogDir "comfy-kitchen-import.stdout.log"
  $importStderr = Join-Path $LogDir "comfy-kitchen-import.stderr.log"
  Remove-Item -LiteralPath $importStdout -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $importStderr -Force -ErrorAction SilentlyContinue

  $importProcess = Start-Process -FilePath $Python -ArgumentList @("-s", "-c", "import comfy_kitchen; print('comfy_kitchen_import_ok')") -WorkingDirectory $Portable -RedirectStandardOutput $importStdout -RedirectStandardError $importStderr -WindowStyle Hidden -Wait -PassThru
  if ($importProcess.ExitCode -ne 0) {
    $stderrRaw = if (Test-Path -LiteralPath $importStderr) { Get-Content -LiteralPath $importStderr -Raw } else { "" }
    $stderrText = if ($null -eq $stderrRaw) { "" } else { ([string]$stderrRaw).Trim() }
    throw "comfy_kitchen reste incompatible avec torch 2.6 apres patch. STDERR=$stderrText"
  }

  if (Test-Path -LiteralPath $patchReport) {
    Write-Host ("Compatibilite comfy-kitchen/torch 2.6 appliquee : {0}" -f (Get-Content -LiteralPath $patchReport -Raw)) -ForegroundColor Green
  }
}

Patch-ComfyKitchenTorch26

Start-Sleep -Milliseconds 750

$args = @(
  "-s",
  $Main,
  "--windows-standalone-build",
  "--listen", "127.0.0.1",
  "--port", [string]$Port,
  "--lowvram",
  "--disable-xformers",
  "--use-pytorch-cross-attention"
)

Write-Host "ComfyUI Hibou : loopback uniquement, low VRAM, port $Port" -ForegroundColor Cyan
$child = Start-Process -FilePath $Python -ArgumentList $args -WorkingDirectory $Portable -RedirectStandardOutput $Stdout -RedirectStandardError $Stderr -WindowStyle Hidden -PassThru

[ordered]@{
  schema = "HIBOU_COMFYUI_AUTOSTART_V2"
  started_at = [DateTimeOffset]::UtcNow.ToString("o")
  pid = $child.Id
  port = $Port
  python = $Python
  main = $Main
  working_directory = $Portable
  stdout = $Stdout
  stderr = $Stderr
  cuda_probe = $cudaProbe.output
} | ConvertTo-Json -Depth 4 | Set-Content -Path $State -Encoding UTF8

Write-Host ("COMFYUI_AUTOSTART_V2 pid={0} state={1}" -f $child.Id, $State) -ForegroundColor Green
