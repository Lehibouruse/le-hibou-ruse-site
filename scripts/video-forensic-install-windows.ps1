param(
  [switch]$ForceRecreate
)

$ErrorActionPreference = "Stop"
if ($env:OS -ne "Windows_NT") { throw "Cet installateur est réservé à Windows." }

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Root = Join-Path $env:LOCALAPPDATA "LeHibou\video\forensic"
$Venv = Join-Path $Root "venv"
$Python = Join-Path $Venv "Scripts\python.exe"
$Pins = Join-Path $RepoRoot "config\video-forensic-python-pins.txt"

if (-not (Test-Path $Pins)) { throw "Pins forensic introuvables : $Pins" }

function Ensure-Python311 {
  if (Get-Command py -ErrorAction SilentlyContinue) {
    & py -3.11 --version *> $null
    if ($LASTEXITCODE -eq 0) { return }
  }
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) { throw "Python 3.11 absent et winget indisponible." }
  winget install --id Python.Python.3.11 -e --accept-source-agreements --accept-package-agreements
  if ($LASTEXITCODE -ne 0) { throw "Installation Python 3.11 échouée." }
}

Ensure-Python311
New-Item -ItemType Directory -Force -Path $Root | Out-Null
if ($ForceRecreate -and (Test-Path $Venv)) { Remove-Item -Recurse -Force $Venv }
if (-not (Test-Path $Python)) {
  & py -3.11 -m venv $Venv
  if ($LASTEXITCODE -ne 0) { throw "Création venv forensic échouée." }
}

& $Python -m pip install --upgrade pip setuptools wheel
if ($LASTEXITCODE -ne 0) { throw "Mise à niveau pip forensic échouée." }
& $Python -m pip install -r $Pins
if ($LASTEXITCODE -ne 0) { throw "Installation dépendances forensic échouée." }

$versions = & $Python -c "import importlib.metadata as m, json; print(json.dumps({'faster_whisper':m.version('faster-whisper'),'opencv_python_headless':m.version('opencv-python-headless')}))"
if ($LASTEXITCODE -ne 0) { throw "Validation dépendances forensic échouée." }
$parsed = $versions | ConvertFrom-Json
if ($parsed.faster_whisper -ne "1.2.1") { throw "faster-whisper inattendu: $($parsed.faster_whisper)" }
if ($parsed.opencv_python_headless -ne "4.14.0.94") { throw "opencv-python-headless inattendu: $($parsed.opencv_python_headless)" }

[Environment]::SetEnvironmentVariable("HIBOU_FORENSIC_PYTHON", $Python, "User")
$env:HIBOU_FORENSIC_PYTHON = $Python

$state = [ordered]@{
  schema = "HIBOU_FORENSIC_PYTHON_ENV_V1"
  updated_at = (Get-Date).ToUniversalTime().ToString("o")
  python = $Python
  faster_whisper = $parsed.faster_whisper
  opencv_python_headless = $parsed.opencv_python_headless
  whisper_model_default = "small"
  paid_fallback = $false
}
$state | ConvertTo-Json -Depth 4 | Set-Content -Path (Join-Path $Root "install-state.json") -Encoding UTF8
Write-Host ($state | ConvertTo-Json -Depth 4)
