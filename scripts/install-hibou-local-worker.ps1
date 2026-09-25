param(
  [switch]$StartWorker
)

$ErrorActionPreference = "Stop"

Write-Host "=== Le Hibou Ruse - installateur legacy redirige vers le worker securise ===" -ForegroundColor Cyan
Write-Host "Le worker Airtable direct n'est plus installe. Le bootstrap GitHub read-only + approbation locale est la voie canonique." -ForegroundColor Yellow

$Bootstrap = Join-Path $PSScriptRoot "bootstrap-hibou-local-worker.ps1"
if (-not (Test-Path $Bootstrap)) {
  throw "Bootstrap securise introuvable : $Bootstrap"
}

if ($StartWorker) {
  Write-Host "Demarrage explicite demande. Aucune autorisation de job n'est creee automatiquement." -ForegroundColor Yellow
  & $Bootstrap -StartWorker
} else {
  & $Bootstrap
}

if ($LASTEXITCODE -ne 0) {
  throw "Le bootstrap securise a echoue (code $LASTEXITCODE)."
}
