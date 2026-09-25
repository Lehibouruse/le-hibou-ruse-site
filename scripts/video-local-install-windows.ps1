param(
  [switch]$InstallVoice,
  [switch]$InstallComfyUI,
  [switch]$InstallFluxSchnell,
  [switch]$StartComfyUI,
  [switch]$ForceRedownload
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$VideoRoot = Join-Path $env:LOCALAPPDATA "LeHibou\video"
$VoiceRoot = Join-Path $VideoRoot "chatterbox"
$VoiceVenv = Join-Path $VoiceRoot "venv"
$ComfyRoot = Join-Path $VideoRoot "comfyui"
$ComfyPortable = Join-Path $ComfyRoot "ComfyUI_windows_portable"
$ComfyDir = Join-Path $ComfyPortable "ComfyUI"
$ComfyPython = Join-Path $ComfyPortable "python_embeded\python.exe"
$ComfyMain = Join-Path $ComfyDir "main.py"
$FluxPath = Join-Path $ComfyDir "models\checkpoints\flux1-schnell-fp8.safetensors"
$StatePath = Join-Path $VideoRoot "install-state.json"

$ChatterboxVersion = "0.1.7"
$TorchVersion = "2.6.0"
$TorchIndex = "https://download.pytorch.org/whl/cu124"
$ComfyArchiveUrl = "https://github.com/comfyanonymous/ComfyUI/releases/latest/download/ComfyUI_windows_portable_nvidia.7z"
$FluxUrl = "https://huggingface.co/Comfy-Org/flux1-schnell/resolve/main/flux1-schnell-fp8.safetensors?download=true"
$FluxSha256 = "ead426278b49030e9da5df862994f25ce94ab2ee4df38b556ddddb3db093bf72"

New-Item -ItemType Directory -Force -Path $VideoRoot | Out-Null

function Require-Windows {
  if ($env:OS -ne "Windows_NT") { throw "Cet installateur est réservé à Windows." }
}

function Command-Exists([string]$Name) {
  return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Refresh-Path {
  $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machinePath;$userPath"
}

function Ensure-Winget {
  if (-not (Command-Exists "winget")) { throw "winget est requis pour installer automatiquement les dépendances manquantes." }
}

function Ensure-WingetPackage([string]$Command, [string]$Id) {
  if (Command-Exists $Command) { return }
  Ensure-Winget
  Write-Host "Installation explicite de $Id..." -ForegroundColor Cyan
  winget install --id $Id -e --accept-source-agreements --accept-package-agreements
  if ($LASTEXITCODE -ne 0) { throw "Échec installation $Id (code $LASTEXITCODE)." }
  Refresh-Path
  if (-not (Command-Exists $Command)) { throw "$Command reste introuvable après installation de $Id." }
}

function Get-Preflight {
  $raw = & node (Join-Path $RepoRoot "scripts\video-local-preflight.mjs")
  if ($LASTEXITCODE -ne 0) { throw "Préflight vidéo impossible." }
  return ($raw | ConvertFrom-Json)
}

function Require-GpuAndDisk([double]$MinDiskGiB = 25) {
  $report = Get-Preflight
  if (-not $report.nvidia_smi_available -or $report.gpus.Count -lt 1) { throw "GPU NVIDIA non détecté : arrêt avant téléchargement." }
  if ([double]$report.disk_free_gib -lt $MinDiskGiB) { throw "Espace disque insuffisant : $($report.disk_free_gib) GiB libres, $MinDiskGiB GiB requis par le garde-fou Hibou." }
  return $report
}

function Ensure-Python311 {
  if (Command-Exists "py") {
    & py -3.11 --version *> $null
    if ($LASTEXITCODE -eq 0) { return }
  }
  Ensure-Winget
  Write-Host "Installation explicite de Python 3.11..." -ForegroundColor Cyan
  winget install --id Python.Python.3.11 -e --accept-source-agreements --accept-package-agreements
  if ($LASTEXITCODE -ne 0) { throw "Échec installation Python 3.11." }
  Refresh-Path
  & py -3.11 --version | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Python 3.11 reste introuvable." }
}

function Invoke-Download([string]$Url, [string]$Destination) {
  if (-not (Command-Exists "curl.exe")) { throw "curl.exe est requis pour les téléchargements reprenables." }
  New-Item -ItemType Directory -Force -Path (Split-Path $Destination -Parent) | Out-Null
  Write-Host "Téléchargement reprenable : $Destination" -ForegroundColor Cyan
  & curl.exe -L --fail --retry 3 --retry-delay 5 -C - $Url -o $Destination
  if ($LASTEXITCODE -ne 0) { throw "Téléchargement échoué : $Url" }
}

function Write-State {
  $voicePython = Join-Path $VoiceVenv "Scripts\python.exe"
  $voiceInstalled = Test-Path $voicePython
  $voiceCuda = $false
  $voiceVersion = ""
  if ($voiceInstalled) {
    try {
      $voiceVersion = (& $voicePython -c "import importlib.metadata as m; print(m.version('chatterbox-tts'))" 2>$null | Select-Object -First 1)
      $voiceCuda = ((& $voicePython -c "import torch; print(str(torch.cuda.is_available()).lower())" 2>$null | Select-Object -First 1) -eq "true")
    } catch {}
  }
  $fluxHash = ""
  $fluxOk = $false
  if (Test-Path $FluxPath) {
    $fluxHash = (Get-FileHash -Algorithm SHA256 $FluxPath).Hash.ToLowerInvariant()
    $fluxOk = $fluxHash -eq $FluxSha256
  }
  $state = [ordered]@{
    schema = "HIBOU_VIDEO_LOCAL_INSTALL_V1"
    updated_at = (Get-Date).ToUniversalTime().ToString("o")
    root = $VideoRoot
    voice = [ordered]@{
      installed = $voiceInstalled
      package = "chatterbox-tts"
      version = $voiceVersion
      python = $voicePython
      cuda_available = $voiceCuda
    }
    comfyui = [ordered]@{
      installed = (Test-Path $ComfyMain)
      root = $ComfyPortable
      python = $ComfyPython
      endpoint = "http://127.0.0.1:8188"
      public_bind_allowed = $false
    }
    flux_schnell_fp8 = [ordered]@{
      installed = (Test-Path $FluxPath)
      path = $FluxPath
      sha256 = $fluxHash
      expected_sha256 = $FluxSha256
      hash_verified = $fluxOk
    }
    policy = [ordered]@{
      paid_fallback = $false
      automatic_model_download = $false
      automatic_service_start = $false
    }
  }
  $state | ConvertTo-Json -Depth 6 | Set-Content -Path $StatePath -Encoding UTF8
}

Require-Windows

Write-Host "=== Hibou vidéo local — installation staged ===" -ForegroundColor Cyan
Write-Host "Audit licences/modeles fail-closed..." -ForegroundColor Cyan
& node (Join-Path $RepoRoot "scripts\video-license-audit.mjs")
if ($LASTEXITCODE -ne 0) { throw "Audit licences Hibou échoué : installation bloquée." }
$diagnostic = Get-Preflight
$diagnostic | ConvertTo-Json -Depth 6
Write-State

if (-not ($InstallVoice -or $InstallComfyUI -or $InstallFluxSchnell -or $StartComfyUI)) {
  Write-Host "Diagnostic uniquement. Aucun paquet, modèle ou service n'a été installé/démarré." -ForegroundColor Yellow
  exit 0
}

if ($InstallVoice) {
  $null = Require-GpuAndDisk 25
  Ensure-Python311
  New-Item -ItemType Directory -Force -Path $VoiceRoot | Out-Null
  $voicePython = Join-Path $VoiceVenv "Scripts\python.exe"
  if (-not (Test-Path $voicePython)) {
    & py -3.11 -m venv $VoiceVenv
    if ($LASTEXITCODE -ne 0) { throw "Création du venv Chatterbox échouée." }
  }
  & $voicePython -m pip install --upgrade pip setuptools wheel
  if ($LASTEXITCODE -ne 0) { throw "Mise à jour pip Chatterbox échouée." }
  & $voicePython -m pip install "torch==$TorchVersion" "torchaudio==$TorchVersion" --index-url $TorchIndex
  if ($LASTEXITCODE -ne 0) { throw "Installation PyTorch CUDA échouée." }
  & $voicePython -m pip install "chatterbox-tts==$ChatterboxVersion"
  if ($LASTEXITCODE -ne 0) { throw "Installation Chatterbox échouée." }
  & $voicePython -c "import torch; from chatterbox.mtl_tts import ChatterboxMultilingualTTS; assert torch.cuda.is_available(), 'CUDA indisponible'; print(torch.__version__); print(torch.version.cuda); print(torch.cuda.get_device_name(0))"
  if ($LASTEXITCODE -ne 0) { throw "Validation Chatterbox/CUDA échouée. Aucun fallback CPU/cloud n'est autorisé." }
  [Environment]::SetEnvironmentVariable("HIBOU_PYTHON", $voicePython, "User")
  $env:HIBOU_PYTHON = $voicePython
  Write-State
}

if ($InstallComfyUI) {
  $null = Require-GpuAndDisk 25
  Ensure-WingetPackage "7z" "7zip.7zip"
  $archive = Join-Path $ComfyRoot "ComfyUI_windows_portable_nvidia.7z"
  if ($ForceRedownload -and (Test-Path $archive)) { Remove-Item -Force $archive }
  if (-not (Test-Path $ComfyMain)) {
    Invoke-Download $ComfyArchiveUrl $archive
    New-Item -ItemType Directory -Force -Path $ComfyRoot | Out-Null
    & 7z x -y $archive "-o$ComfyRoot"
    if ($LASTEXITCODE -ne 0) { throw "Extraction ComfyUI échouée." }
    if (-not (Test-Path $ComfyMain) -or -not (Test-Path $ComfyPython)) { throw "Installation ComfyUI portable incomplète." }
    Remove-Item -Force $archive
  }
  Write-State
}

if ($InstallFluxSchnell) {
  $null = Require-GpuAndDisk 30
  if (-not (Test-Path $ComfyMain)) { throw "Installer ComfyUI avant FLUX Schnell." }
  New-Item -ItemType Directory -Force -Path (Split-Path $FluxPath -Parent) | Out-Null
  if (Test-Path $FluxPath) {
    $current = (Get-FileHash -Algorithm SHA256 $FluxPath).Hash.ToLowerInvariant()
    if ($current -eq $FluxSha256) {
      Write-Host "FLUX Schnell FP8 déjà présent et hash vérifié." -ForegroundColor Green
    } elseif ($ForceRedownload) {
      Remove-Item -Force $FluxPath
    } else {
      throw "FLUX Schnell existe mais son SHA-256 ne correspond pas. Utiliser -ForceRedownload seulement après vérification."
    }
  }
  if (-not (Test-Path $FluxPath)) {
    Invoke-Download $FluxUrl $FluxPath
    $actual = (Get-FileHash -Algorithm SHA256 $FluxPath).Hash.ToLowerInvariant()
    if ($actual -ne $FluxSha256) {
      Remove-Item -Force $FluxPath
      throw "SHA-256 FLUX invalide. Fichier supprimé."
    }
  }
  Write-State
}

if ($StartComfyUI) {
  if (-not (Test-Path $ComfyMain) -or -not (Test-Path $ComfyPython)) { throw "ComfyUI n'est pas installé." }
  Write-Host "Démarrage explicite ComfyUI sur loopback uniquement : http://127.0.0.1:8188" -ForegroundColor Cyan
  & (Join-Path $RepoRoot "scripts\video-start-comfyui-windows.ps1")
}

Write-State
Write-Host "État écrit dans : $StatePath" -ForegroundColor Green
