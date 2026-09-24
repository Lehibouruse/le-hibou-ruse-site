param(
  [string]$BackupRoot = ""
)

$ErrorActionPreference = "Stop"

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$LogRoot = Join-Path $env:LOCALAPPDATA "LeHibou\backup-logs"
New-Item -ItemType Directory -Force -Path $LogRoot | Out-Null

$token = [Environment]::GetEnvironmentVariable("AIRTABLE_TOKEN", "User")
if ([string]::IsNullOrWhiteSpace($token)) {
  $token = $env:AIRTABLE_TOKEN
}
if ([string]::IsNullOrWhiteSpace($token)) {
  throw "AIRTABLE_TOKEN absent de l'environnement utilisateur/processus. Aucun backup n'a été lance."
}
$env:AIRTABLE_TOKEN = $token

if (-not [string]::IsNullOrWhiteSpace($BackupRoot)) {
  $env:HIBOU_BACKUP_ROOT = $BackupRoot
}

Push-Location $RepoRoot
try {
  $backupJson = (& node scripts/backup-project-local.mjs --all | Out-String)
  if ($LASTEXITCODE -ne 0) {
    throw "backup-project-local.mjs a echoue."
  }
  $backup = $backupJson | ConvertFrom-Json
  if ([string]::IsNullOrWhiteSpace($backup.backup_dir)) {
    throw "Le backup n'a pas renvoye de dossier."
  }

  $rehearsalJson = (& node scripts/restore-rehearsal-local.mjs $backup.backup_dir | Out-String)
  if ($LASTEXITCODE -ne 0) {
    throw "restore-rehearsal-local.mjs a echoue."
  }
  $rehearsal = $rehearsalJson | ConvertFrom-Json
  if ($rehearsal.ok -ne $true) {
    throw "Le rehearsal de restauration a echoue."
  }

  $stamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH-mm-ssZ")
  $result = [ordered]@{
    schema = "HIBOU_WINDOWS_BACKUP_RUN_V1"
    completed_at = (Get-Date).ToUniversalTime().ToString("o")
    backup_dir = $backup.backup_dir
    artifact_count = $backup.artifact_count
    rehearsal_ok = $true
    airtable_restore_performed = $false
    secrets_logged = $false
  }
  $result | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 (Join-Path $LogRoot "$stamp.json")
  $result | ConvertTo-Json -Depth 5
}
finally {
  Pop-Location
}
