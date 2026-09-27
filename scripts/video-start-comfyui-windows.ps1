param(
  [int]$Port = 8188
)

# COMFYUI_AUTOSTART_V2
$ErrorActionPreference = "Stop"
$VideoRoot = Join-Path $env:LOCALAPPDATA "LeHibou\video"
$Portable = Join-Path $VideoRoot "comfyui\ComfyUI_windows_portable"
$Python = Join-Path $Portable "python_embeded\python.exe"
$Main = Join-Path $Portable "ComfyUI\main.py"
$LogDir = Join-Path $env:LOCALAPPDATA "LeHibou\logs"
$Stdout = Join-Path $LogDir "comfyui-autostart.stdout.log"
$Stderr = Join-Path $LogDir "comfyui-autostart.stderr.log"
$State = Join-Path $LogDir "comfyui-autostart-state.json"

if (-not (Test-Path $Python) -or -not (Test-Path $Main)) {
  throw "ComfyUI portable Hibou introuvable. Lancer d'abord video-local-install-windows.ps1 -InstallComfyUI."
}
if ($Port -lt 1024 -or $Port -gt 65535) { throw "Port invalide." }

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

$CudaRepairLog = Join-Path $LogDir "comfyui-cuda-repair.log"

function Test-ComfyCuda {
  $probeCode = @'
import json, torch
ok = bool(torch.cuda.is_available())
print(json.dumps({
    "torch": str(torch.__version__),
    "cuda_runtime": str(torch.version.cuda),
    "cuda_available": ok,
    "device": torch.cuda.get_device_name(0) if ok else None,
}))
raise SystemExit(0 if ok else 3)
'@
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $probeOutput = & $Python -c $probeCode 2>$null
    $probeExit = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  return [ordered]@{
    ok = ($probeExit -eq 0)
    exit_code = $probeExit
    output = (($probeOutput | Out-String).Trim())
  }
}

$cudaProbe = Test-ComfyCuda
if (-not $cudaProbe.ok) {
  Write-Host "CUDA PyTorch ComfyUI indisponible; reparation automatique vers torch 2.6.0 + cu124..." -ForegroundColor Yellow
  ("[{0}] probe before repair: {1}" -f ([DateTimeOffset]::UtcNow.ToString("o")), $cudaProbe.output) | Add-Content -Path $CudaRepairLog -Encoding UTF8

  $pipArgs = @(
    "-m", "pip", "install",
    "--disable-pip-version-check",
    "--no-input",
    "--upgrade",
    "--force-reinstall",
    "torch==2.6.0",
    "torchvision==0.21.0",
    "torchaudio==2.6.0",
    "--index-url", "https://download.pytorch.org/whl/cu124"
  )

  & $Python @pipArgs *>&1 | Tee-Object -FilePath $CudaRepairLog -Append
  if ($LASTEXITCODE -ne 0) {
    throw "Reparation PyTorch CUDA 12.4 echouee. Voir $CudaRepairLog"
  }

  $cudaProbe = Test-ComfyCuda
  ("[{0}] probe after repair: {1}" -f ([DateTimeOffset]::UtcNow.ToString("o")), $cudaProbe.output) | Add-Content -Path $CudaRepairLog -Encoding UTF8
  if (-not $cudaProbe.ok) {
    throw "CUDA reste indisponible apres reparation PyTorch cu124. Probe: $($cudaProbe.output)"
  }
}

Write-Host ("CUDA ComfyUI OK : {0}" -f $cudaProbe.output) -ForegroundColor Green


Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object {
    $_.Name -match '^python(\.exe)?$' -and
    $_.CommandLine -like "*ComfyUI\main.py*" -and
    $_.CommandLine -like "*$Portable*"
  } |
  ForEach-Object {
    try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {}
  }

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

Write-Host ("ComfyUI Hibou : loopback uniquement, low VRAM, port $Port") -ForegroundColor Cyan
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
} | ConvertTo-Json -Depth 4 | Set-Content -Path $State -Encoding UTF8

Write-Host ("COMFYUI_AUTOSTART_V2 pid={0} state={1}" -f $child.Id, $State) -ForegroundColor Green
