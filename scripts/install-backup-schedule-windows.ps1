param(
  [switch]$Install,
  [switch]$Uninstall,
  [ValidateSet("Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday")]
  [string]$Day = "Sunday",
  [ValidatePattern("^([01]\d|2[0-3]):[0-5]\d$")]
  [string]$Time = "03:30"
)

$ErrorActionPreference = "Stop"

$TaskName = "Le Hibou Ruse - Weekly Backup"
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Runner = Join-Path $RepoRoot "scripts\run-weekly-backup-windows.ps1"

if ($Install -and $Uninstall) {
  throw "Choisir -Install ou -Uninstall, pas les deux."
}

if (-not $Install -and -not $Uninstall) {
  [ordered]@{
    schema = "HIBOU_WINDOWS_BACKUP_SCHEDULE_PLAN_V1"
    task_name = $TaskName
    repository = $RepoRoot
    runner = $Runner
    schedule = "$Day $Time"
    installed = $false
    task_started = $false
    requirements = @(
      "AIRTABLE_TOKEN doit exister dans l'environnement utilisateur Windows",
      "Le dossier de backup reste hors du depot Git",
      "Le backup hebdomadaire exporte Git + tables Airtable safe par defaut",
      "Chaque run execute un restore rehearsal local non destructif"
    )
  } | ConvertTo-Json -Depth 5
  exit 0
}

if ($Uninstall) {
  if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  }
  Write-Host "Tache supprimee : $TaskName"
  exit 0
}

$token = [Environment]::GetEnvironmentVariable("AIRTABLE_TOKEN", "User")
if ([string]::IsNullOrWhiteSpace($token)) {
  throw "AIRTABLE_TOKEN n'est pas defini dans l'environnement utilisateur. Le script refuse de l'enregistrer dans la tache planifiee."
}

$at = [datetime]::ParseExact($Time, "HH:mm", [System.Globalization.CultureInfo]::InvariantCulture)
$argument = '-NoProfile -ExecutionPolicy Bypass -File "' + $Runner + '"'
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $argument -WorkingDirectory $RepoRoot
$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $Day -At $at
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal | Out-Null

Write-Host "Tache installee mais non lancee : $TaskName"
Write-Host "Planification : $Day $Time"
Write-Host "Aucun secret n'a ete copie dans les arguments de la tache."
