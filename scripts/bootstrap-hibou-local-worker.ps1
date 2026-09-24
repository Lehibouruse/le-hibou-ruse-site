param([switch]$StartWorker, [switch]$ApproveCorpus150)

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
[Environment]::SetEnvironmentVariable("HIBOU_REPORT_URL", "https://d4d5d6.com/api/local-worker-status", "User")
[Environment]::SetEnvironmentVariable("HIBOU_LOCAL_EXECUTION_ENABLED", "false", "User")

$env:HIBOU_MEDIA_ROOT = $MediaRoot
$env:HIBOU_QUEUE_URL = $QueueUrl
$env:HIBOU_WORKER_POLL_MS = "15000"
$env:HIBOU_REPORT_URL = "https://d4d5d6.com/api/local-worker-status"
$env:HIBOU_LOCAL_EXECUTION_ENABLED = "false"


$ApprovalFile = Join-Path $env:LOCALAPPDATA "LeHibou\approved-jobs.json"
if ($ApproveCorpus150) {
  $approvedIds = @(
  "reels-richissime-01-v1",
  "reels-stratege-impot-04-v1",
  "reels-stratege-impot-03-v1",
  "reels-stratege-impot-02-v1",
  "reels-stratege-impot-01-v1",
  "reels-renard-top50-01-v1",
  "reels-renard-top50-02-v1",
  "reels-renard-top50-03-v1",
  "reels-renard-top50-04-v1",
  "reels-renard-top50-05-v1",
  "reels-renard-top50-06-v1",
  "reels-renard-top50-07-v1",
  "reels-renard-top50-08-v1",
  "reels-renard-top50-09-v1",
  "reels-renard-top50-10-v1",
  "reels-renard-top50-11-v1",
  "reels-renard-top50-12-v1",
  "reels-renard-top50-13-v1",
  "reels-renard-top50-14-v1",
  "reels-renard-top50-15-v1",
  "reels-renard-top50-16-v1",
  "reels-renard-top50-17-v1",
  "reels-renard-top50-18-v1",
  "reels-renard-top50-19-v1",
  "reels-renard-top50-20-v1",
  "reels-renard-top50-21-v1",
  "reels-renard-top50-22-v1",
  "reels-renard-top50-23-v1",
  "reels-renard-top50-24-v1",
  "reels-renard-top50-25-v1",
  "reels-renard-top50-26-v1",
  "reels-renard-top50-27-v1",
  "reels-renard-top50-28-v1",
  "reels-renard-top50-29-v1",
  "reels-renard-top50-30-v1",
  "reels-renard-top50-31-v1",
  "reels-renard-top50-32-v1",
  "reels-renard-top50-33-v1",
  "reels-renard-top50-34-v1",
  "reels-renard-top50-35-v1",
  "reels-renard-top50-36-v1",
  "reels-renard-top50-37-v1",
  "reels-renard-top50-38-v1",
  "reels-renard-top50-39-v1",
  "reels-renard-top50-40-v1",
  "reels-renard-top50-41-v1",
  "reels-renard-top50-42-v1",
  "reels-renard-top50-43-v1",
  "reels-renard-top50-44-v1",
  "reels-renard-top50-45-v1",
  "reels-renard-top50-46-v1",
  "reels-renard-top50-47-v1",
  "reels-renard-top50-48-v1",
  "reels-renard-top50-49-v1",
  "reels-renard-top50-50-v1",
  "reels-furet-top50-01-v1",
  "reels-furet-top50-02-v1",
  "reels-furet-top50-03-v1",
  "reels-furet-top50-04-v1",
  "reels-furet-top50-05-v1",
  "reels-furet-top50-06-v1",
  "reels-furet-top50-07-v1",
  "reels-furet-top50-08-v1",
  "reels-furet-top50-09-v1",
  "reels-furet-top50-10-v1",
  "reels-furet-top50-11-v1",
  "reels-furet-top50-12-v1",
  "reels-furet-top50-13-v1",
  "reels-furet-top50-14-v1",
  "reels-furet-top50-15-v1",
  "reels-furet-top50-16-v1",
  "reels-furet-top50-17-v1",
  "reels-furet-top50-18-v1",
  "reels-furet-top50-19-v1",
  "reels-furet-top50-20-v1",
  "reels-furet-top50-21-v1",
  "reels-furet-top50-22-v1",
  "reels-furet-top50-23-v1",
  "reels-furet-top50-24-v1",
  "reels-furet-top50-25-v1",
  "reels-furet-top50-26-v1",
  "reels-furet-top50-27-v1",
  "reels-furet-top50-28-v1",
  "reels-furet-top50-29-v1",
  "reels-furet-top50-30-v1",
  "reels-furet-top50-31-v1",
  "reels-furet-top50-32-v1",
  "reels-furet-top50-33-v1",
  "reels-furet-top50-34-v1",
  "reels-furet-top50-35-v1",
  "reels-furet-top50-36-v1",
  "reels-furet-top50-37-v1",
  "reels-furet-top50-38-v1",
  "reels-furet-top50-39-v1",
  "reels-furet-top50-40-v1",
  "reels-furet-top50-41-v1",
  "reels-furet-top50-42-v1",
  "reels-furet-top50-43-v1",
  "reels-furet-top50-44-v1",
  "reels-furet-top50-45-v1",
  "reels-furet-top50-46-v1",
  "reels-furet-top50-47-v1",
  "reels-furet-top50-48-v1",
  "reels-furet-top50-49-v1",
  "reels-furet-top50-50-v1",
  "reels-finance-panthere-01-v1",
  "reels-finance-panthere-02-v1",
  "reels-finance-panthere-03-v1",
  "reels-finance-panthere-04-v1",
  "reels-finance-panthere-05-v1",
  "reels-monsieur-chimp-01-v1",
  "reels-finance-panthere-tiktok-7649878022354504993-v1",
  "reels-finance-panthere-tiktok-7634292064515083553-v1",
  "reels-finance-panthere-tiktok-7631693479185354016-v1",
  "reels-finance-panthere-tiktok-7635000346640747809-v1",
  "reels-finance-panthere-tiktok-7641873502626204961-v1",
  "reels-finance-panthere-tiktok-7629063822749289761-v1",
  "reels-finance-panthere-tiktok-7645058924604820768-v1",
  "reels-finance-panthere-tiktok-7642825784956112161-v1",
  "reels-finance-panthere-tiktok-7630923023440268576-v1",
  "reels-finance-panthere-tiktok-7630587558539414816-v1",
  "reels-finance-panthere-tiktok-7633139197016100129-v1",
  "reels-finance-panthere-tiktok-7636891104876547360-v1",
  "reels-finance-panthere-tiktok-7630036576214469921-v1",
  "reels-finance-panthere-tiktok-7629795204467363104-v1",
  "reels-renard-top100-051-v1",
  "reels-renard-top100-052-v1",
  "reels-renard-top100-053-v1",
  "reels-renard-top100-054-v1",
  "reels-renard-top100-056-v1",
  "reels-renard-top100-057-v1",
  "reels-renard-top100-058-v1",
  "reels-renard-top100-059-v1",
  "reels-furet-top100-051-v1",
  "reels-furet-top100-052-v1",
  "reels-furet-top100-053-v1",
  "reels-furet-top100-054-v1",
  "reels-furet-top100-055-v1",
  "reels-furet-top100-056-v1",
  "reels-furet-top100-057-v1",
  "reels-furet-top100-058-v1",
  "reels-furet-top100-059-v1",
  "reels-furet-top100-060-v1",
  "reels-furet-top100-061-v1",
  "reels-furet-top100-062-v1",
  "reels-furet-top100-063-v1",
  "reels-furet-top100-064-v1",
  "reels-furet-top100-065-v1",
  "reels-furet-top100-066-v1",
  "reels-furet-top100-067-v1"
  )
  $approvalPayload = @{ batch_id = "competitor-reels-150-v1"; approved_at = (Get-Date).ToUniversalTime().ToString("o"); job_ids = $approvedIds }
  $approvalPayload | ConvertTo-Json -Depth 4 | Set-Content -Path $ApprovalFile -Encoding UTF8
  Write-Host "Corpus local approuve : $($approvedIds.Count) jobs." -ForegroundColor Green
}

$Node = (Get-Command node).Source

$StartupDir = [Environment]::GetFolderPath("Startup")
$StartupCmd = Join-Path $StartupDir "LeHibouWorker.cmd"
$CmdContent = @"
@echo off
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -UseBasicParsing -Uri \"$WorkerUrl\" -OutFile \"$Worker\" } catch {}"
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

  # Stop old Hibou worker process before replacing it with the current version.
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like "*hibou-github-worker.mjs*" } |
    ForEach-Object {
      try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {}
    }
  Start-Sleep -Milliseconds 500

  Start-Process -FilePath $Node -ArgumentList "`"$Worker`"" -WorkingDirectory $InstallDir -WindowStyle Hidden
  Start-Sleep -Seconds 2
  Write-Host "Worker active explicitement. Etat local : http://127.0.0.1:8765/health"
} else {
  Write-Host "Aucun job ne sera execute maintenant. Pour activer le corpus autorise : relancer avec -ApproveCorpus150 -StartWorker." -ForegroundColor Yellow
}
