$ErrorActionPreference = "SilentlyContinue"

$TaskName = "Le Hibou Ruse - Local Worker"

Stop-ScheduledTask -TaskName $TaskName
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false

[Environment]::SetEnvironmentVariable("HIBOU_MEDIA_ROOT", $null, "User")
[Environment]::SetEnvironmentVariable("HIBOU_AIRTABLE_BASE_ID", $null, "User")
[Environment]::SetEnvironmentVariable("HIBOU_LOCAL_WORKER_TABLE_ID", $null, "User")
[Environment]::SetEnvironmentVariable("HIBOU_WORKER_POLL_MS", $null, "User")

Write-Host "Worker local desactive."
Write-Host "Les medias et le token Airtable utilisateur n'ont pas ete supprimes."
