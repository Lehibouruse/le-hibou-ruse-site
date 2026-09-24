param(
  [switch]$StartWorker
)

$ErrorActionPreference = "Stop"

Write-Host "=== Le Hibou Ruse - installation du worker local sans token ===" -ForegroundColor Cyan

$InstallDir = Join-Path $env:LOCALAPPDATA "LeHibou"
$Worker = Join-Path $InstallDir "hibou-github-worker.mjs"
$MediaRoot = Join-Path $env:USERPROFILE "HibouMedia"
$TaskName = "Le Hibou Ruse - Local Worker"
$WorkerUrl = "https://raw.githubusercontent.com/Lehibouruse/le-hibou-ruse-site/main/scripts/hibou-github-worker.mjs"
$QueueUrl = "https://raw.githubusercontent.com/Lehibouruse/le-hibou-ruse-site/main/config/local-worker-queue.json"

function Refresh-Path {
  $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machinePath;$userPath"
}

function Ensure-WingetPackage {
  param([string]$Command, [string]$Id)

  Refresh-Path
  if (Get-Command $Command -ErrorAction SilentlyContinue) {
    Write-Host "$Command deja disponible."
    return
  }

  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw "winget est requis pour installer $Command."
  }

  Write-Host "Installation/verif de $Id..."
  winget install --id $Id -e --accept-source-agreements --accept-package-agreements
  $wingetCode = $LASTEXITCODE

  Refresh-Path
  if (Get-Command $Command -ErrorAction SilentlyContinue) {
    Write-Host "$Command est disponible. Code winget ignore: $wingetCode"
    return
  }

  throw "Impossible de rendre $Command disponible (winget code $wingetCode)."
}

Ensure-WingetPackage -Command "node" -Id "OpenJS.NodeJS.LTS"
Ensure-WingetPackage -Command "yt-dlp" -Id "yt-dlp.yt-dlp"
Ensure-WingetPackage -Command "ffmpeg" -Id "Gyan.FFmpeg"

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path $MediaRoot | Out-Null

Write-Host "Recuperation du worker Hibou..."
Invoke-WebRequest -UseBasicParsing -Uri $WorkerUrl -OutFile $Worker

[Environment]::SetEnvironmentVariable("HIBOU_MEDIA_ROOT", $MediaRoot, "User")
[Environment]::SetEnvironmentVariable("HIBOU_QUEUE_URL", $QueueUrl, "User")
[Environment]::SetEnvironmentVariable("HIBOU_WORKER_POLL_MS", "15000", "User")
[Environment]::SetEnvironmentVariable("HIBOU_LOCAL_EXECUTION_ENABLED", "false", "User")

$env:HIBOU_MEDIA_ROOT = $MediaRoot
$env:HIBOU_QUEUE_URL = $QueueUrl
$env:HIBOU_WORKER_POLL_MS = "15000"
$env:HIBOU_LOCAL_EXECUTION_ENABLED = "false"

$Node = (Get-Command node).Source

$StartupDir = [Environment]::GetFolderPath("Startup")
$StartupCmd = Join-Path $StartupDir "LeHibouWorker.cmd"
$CmdContent = @"
@echo off
start "" /min "$Node" "$Worker"
"@
Set-Content -Path $StartupCmd -Value $CmdContent -Encoding ASCII

Write-Host "Diagnostic local uniquement - aucun acces a la queue et aucun telechargement..." -ForegroundColor Cyan
& $Node $Worker --diagnostic
if ($LASTEXITCODE -ne 0) { throw "Le diagnostic du worker a echoue." }

Write-Host ""
Write-Host "Worker Hibou installe." -ForegroundColor Green
Write-Host "Stockage : $MediaRoot"
Write-Host "Demarrage auto utilisateur : $StartupCmd"

if ($StartWorker) {
  [Environment]::SetEnvironmentVariable("HIBOU_LOCAL_EXECUTION_ENABLED", "true", "User")
  $env:HIBOU_LOCAL_EXECUTION_ENABLED = "true"
  Start-Process -FilePath $Node -ArgumentList "`"$Worker`"" -WorkingDirectory $InstallDir -WindowStyle Hidden
  Start-Sleep -Seconds 2
  Write-Host "Worker active explicitement. Etat local : http://127.0.0.1:8765/health"
} else {
  Write-Host "Aucun job ne sera execute maintenant. Pour activer : relancer ce script avec -StartWorker." -ForegroundColor Yellow
}
