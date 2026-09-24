param(
  [switch]$StartWorker
)

$ErrorActionPreference = "Stop"

Write-Host "=== Le Hibou Ruse - installation du worker local ===" -ForegroundColor Cyan

$InstallDir = Join-Path $env:LOCALAPPDATA "LeHibou"
$Worker = Join-Path $InstallDir "hibou-local-worker.mjs"
$MediaRoot = Join-Path $env:USERPROFILE "HibouMedia"
$TaskName = "Le Hibou Ruse - Local Worker"
$WorkerUrl = "https://raw.githubusercontent.com/Lehibouruse/le-hibou-ruse-site/main/scripts/hibou-local-worker.mjs"

function Refresh-Path {
  $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machinePath;$userPath"
}

function Ensure-WingetPackage {
  param([string]$Command, [string]$Id)
  if (Get-Command $Command -ErrorAction SilentlyContinue) {
    Write-Host "$Command deja disponible."
    return
  }
  if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw "winget est requis pour installer $Command automatiquement."
  }
  Write-Host "Installation de $Id..."
  winget install --id $Id -e --accept-source-agreements --accept-package-agreements
  if ($LASTEXITCODE -ne 0) {
    throw "Echec installation $Id (code $LASTEXITCODE)."
  }
  Refresh-Path
}

Ensure-WingetPackage -Command "node" -Id "OpenJS.NodeJS.LTS"
Ensure-WingetPackage -Command "yt-dlp" -Id "yt-dlp.yt-dlp"
Ensure-WingetPackage -Command "ffmpeg" -Id "Gyan.FFmpeg"

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path $MediaRoot | Out-Null

Write-Host "Recuperation du worker Hibou depuis le depot public..."
Invoke-WebRequest -UseBasicParsing -Uri $WorkerUrl -OutFile $Worker

[Environment]::SetEnvironmentVariable("HIBOU_MEDIA_ROOT", $MediaRoot, "User")
[Environment]::SetEnvironmentVariable("HIBOU_AIRTABLE_BASE_ID", "appWyUX7TYPNrDbyP", "User")
[Environment]::SetEnvironmentVariable("HIBOU_LOCAL_WORKER_TABLE_ID", "tbl8VTZsY6uv3z9Y7", "User")
[Environment]::SetEnvironmentVariable("HIBOU_WORKER_POLL_MS", "15000", "User")

$existing = [Environment]::GetEnvironmentVariable("AIRTABLE_TOKEN", "User")
if ([string]::IsNullOrWhiteSpace($existing)) {
  Write-Host ""
  Write-Host "Un token Airtable lecture/ecriture est requis pour la file locale. Ne le colle jamais dans le chat." -ForegroundColor Yellow
  $secure = Read-Host "Token Airtable" -AsSecureString
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
  if ([string]::IsNullOrWhiteSpace($plain)) {
    throw "Token Airtable vide."
  }
  [Environment]::SetEnvironmentVariable("AIRTABLE_TOKEN", $plain, "User")
  $env:AIRTABLE_TOKEN = $plain
} else {
  $env:AIRTABLE_TOKEN = $existing
}

$env:HIBOU_MEDIA_ROOT = $MediaRoot
$env:HIBOU_AIRTABLE_BASE_ID = "appWyUX7TYPNrDbyP"
$env:HIBOU_LOCAL_WORKER_TABLE_ID = "tbl8VTZsY6uv3z9Y7"
$env:HIBOU_WORKER_POLL_MS = "15000"

$Node = (Get-Command node).Source
$Action = New-ScheduledTaskAction -Execute $Node -Argument "`"$Worker`"" -WorkingDirectory $InstallDir
$Trigger = New-ScheduledTaskTrigger -AtLogOn
$Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 20 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}
Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal | Out-Null

Write-Host "Diagnostic local uniquement — aucun job Airtable n'est execute..." -ForegroundColor Cyan
& $Node $Worker --diagnostic
if ($LASTEXITCODE -ne 0) {
  throw "Le diagnostic local du worker a echoue."
}

Write-Host ""
Write-Host "Worker Hibou installe." -ForegroundColor Green
Write-Host "Stockage : $MediaRoot"
Write-Host "Logs : $InstallDir\worker.log"

if ($StartWorker) {
  Write-Host "Demarrage explicite demande par -StartWorker." -ForegroundColor Yellow
  Start-ScheduledTask -TaskName $TaskName
  Start-Sleep -Seconds 2
  Write-Host "Etat local : http://127.0.0.1:8765/health"
} else {
  Write-Host "Le worker N'A PAS ete demarre. Aucun job Airtable ne sera execute." -ForegroundColor Yellow
  Write-Host "Apres validation, demarrer avec : Start-ScheduledTask -TaskName \"$TaskName\""
}
