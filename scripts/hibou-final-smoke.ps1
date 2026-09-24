$ErrorActionPreference = "Stop"

Write-Host "=== Hibou - test final de telechargement ===" -ForegroundColor Cyan

$TestUrl = "https://www.tiktok.com/@lefutetfute/video/7680439152348810528"
$TestDir = Join-Path $env:USERPROFILE "HibouMedia\_smoke_test"
$InstallDir = Join-Path $env:LOCALAPPDATA "LeHibou"
$Worker = Join-Path $InstallDir "hibou-github-worker.mjs"
$WorkerUrl = "https://raw.githubusercontent.com/Lehibouruse/le-hibou-ruse-site/main/scripts/hibou-github-worker.mjs"

if (-not (Get-Command yt-dlp -ErrorAction SilentlyContinue)) {
  throw "yt-dlp introuvable."
}
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
  throw "ffmpeg introuvable."
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "node introuvable."
}

New-Item -ItemType Directory -Force -Path $TestDir | Out-Null

Write-Host "Telechargement direct d'un Reel test, sans sous-titres..." -ForegroundColor Cyan

$args = @(
  "--no-playlist",
  "--no-write-subs",
  "--no-write-auto-subs",
  "--no-write-comments",
  "--newline",
  "--windows-filenames",
  "--restrict-filenames",
  "--retries", "10",
  "--fragment-retries", "10",
  "--retry-sleep", "http:exp=1:20",
  "--sleep-requests", "1",
  "-f", "bv*+ba/b",
  "--merge-output-format", "mp4",
  "-o", (Join-Path $TestDir "%(uploader)s - %(title)s [%(id)s].%(ext)s"),
  $TestUrl
)

& yt-dlp @args
if ($LASTEXITCODE -ne 0) {
  throw "Le telechargement direct a echoue. L'erreur yt-dlp ci-dessus est maintenant le seul point a diagnostiquer."
}

$video = Get-ChildItem -Path $TestDir -File -ErrorAction SilentlyContinue |
  Where-Object { $_.Extension -match "^\.(mp4|mkv|webm|mov)$" -and $_.Length -gt 0 } |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

if (-not $video) {
  throw "yt-dlp a termine sans erreur, mais aucun fichier video non vide n'a ete trouve."
}

$sizeMb = [Math]::Round($video.Length / 1MB, 1)
Write-Host ""
Write-Host ("SUCCES : 1 VIDEO REELLEMENT TELECHARGEE - {0} Mo" -f $sizeMb) -ForegroundColor Green
Write-Host ("Fichier : {0}" -f $video.FullName) -ForegroundColor Green

Write-Host ""
Write-Host "Mise a jour et redemarrage du worker automatique..." -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
Invoke-WebRequest -UseBasicParsing -Uri $WorkerUrl -OutFile $Worker

[Environment]::SetEnvironmentVariable("HIBOU_LOCAL_EXECUTION_ENABLED", "true", "User")
$env:HIBOU_LOCAL_EXECUTION_ENABLED = "true"

Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like "*hibou-github-worker.mjs*" } |
  ForEach-Object {
    try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {}
  }

Start-Sleep -Milliseconds 500
$Node = (Get-Command node).Source
Start-Process -FilePath $Node -ArgumentList "`"$Worker`"" -WorkingDirectory $InstallDir -WindowStyle Hidden
Start-Sleep -Seconds 3

try {
  $health = Invoke-RestMethod -Uri "http://127.0.0.1:8765/health" -TimeoutSec 5
  Write-Host ("Worker : {0} | approuves : {1} | traites : {2}" -f $health.status, $health.approved_manifest_count, $health.processed_jobs.Count) -ForegroundColor Green
} catch {
  Write-Host "Le MP4 test est bien telecharge. Le worker est lance mais son endpoint health n'est pas encore joignable." -ForegroundColor Yellow
}
