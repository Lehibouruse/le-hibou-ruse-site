param(
  [switch]$Activate,
  [string]$Storyboard = "",
  [string]$SourceSnapshot = "",
  [string]$Binding = "",
  [string]$QueueUrl = "https://d4d5d6.com/api/local-worker-queue"
)

$ErrorActionPreference = "Stop"
$SourceRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$Worker = Join-Path $SourceRoot "scripts\hibou-github-worker.mjs"
$Master = Join-Path $SourceRoot "scripts\video-master.mjs"
$Verifier = Join-Path $SourceRoot "scripts\video-airtable-sync.mjs"
$OcrScript = Join-Path $SourceRoot "scripts\video-generated-text-qc.py"
$Node = (Get-Command node -ErrorAction Stop).Source
$OcrPython = [Environment]::GetEnvironmentVariable("HIBOU_OCR_PYTHON", "User")
$CreativePython = [Environment]::GetEnvironmentVariable("HIBOU_PYTHON", "User")
$CreativeModel = [Environment]::GetEnvironmentVariable("HIBOU_CREATIVE_QC_MODEL", "User")
if (-not $CreativeModel) { $CreativeModel = "openai/clip-vit-base-patch32" }
$Token = [Environment]::GetEnvironmentVariable("HIBOU_LOCAL_REPORT_TOKEN", "User")
if (-not $Binding) { $Binding = [Environment]::GetEnvironmentVariable("HIBOU_VIDEO_BINDING", "User") }
if (-not $Binding) { $Binding = Join-Path $env:USERPROFILE "Documents\Codex\HibouVideo\comfyui-binding.json" }

foreach ($File in @($Worker, $Master, $Verifier, $OcrScript, $Binding)) {
  if (-not (Test-Path -LiteralPath $File -PathType Leaf)) { throw "Fichier local requis introuvable : $File" }
}
if (-not $OcrPython -or -not (Test-Path -LiteralPath $OcrPython -PathType Leaf)) {
  throw "HIBOU_OCR_PYTHON introuvable pour le contrôle des fonds générés."
}
& $OcrPython -c "import rapidocr_onnxruntime"
if ($LASTEXITCODE -ne 0) { throw "RapidOCR ne démarre pas dans HIBOU_OCR_PYTHON." }

if (-not $CreativePython -or -not (Test-Path -LiteralPath $CreativePython -PathType Leaf)) {
  throw "HIBOU_PYTHON introuvable pour le QC créatif V5. Exécuter video:doctor:windows puis -InstallCreativeQc."
}
$CreativeProbe = @'
from transformers import CLIPModel, CLIPProcessor
import sys
model_id = sys.argv[1]
CLIPProcessor.from_pretrained(model_id, local_files_only=True)
CLIPModel.from_pretrained(model_id, local_files_only=True)
print("HIBOU_CREATIVE_QC_READY")
'@
$CreativeProbePath = Join-Path $env:TEMP "hibou-v5-creative-qc-probe.py"
$CreativeProbe | Set-Content -LiteralPath $CreativeProbePath -Encoding UTF8
& $CreativePython $CreativeProbePath $CreativeModel | Out-Null
$CreativeProbeStatus = $LASTEXITCODE
Remove-Item -LiteralPath $CreativeProbePath -Force -ErrorAction SilentlyContinue
if ($CreativeProbeStatus -ne 0) {
  throw "QC créatif V5 indisponible localement. Exécuter video:doctor:windows puis video-local-install-windows.ps1 -InstallCreativeQc."
}
foreach ($File in @($Worker, $Master, $Verifier)) {
  & $Node --check $File
  if ($LASTEXITCODE -ne 0) { throw "Contrôle syntaxique échoué : $File" }
}
if (-not $Token -or $Token.Length -lt 32) { throw "HIBOU_LOCAL_REPORT_TOKEN utilisateur absent ou invalide." }

$Headers = @{ Authorization = "Bearer $Token"; "User-Agent" = "Le-Hibou-V5-Local-Launcher/1.0" }
$Queue = Invoke-RestMethod -Uri ($QueueUrl + "?t=" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) `
  -Headers $Headers -Method Get -TimeoutSec 20
if (-not $Queue.ok -or $Queue.schema -ne "HIBOU_VIDEO_RENDER_QUEUE_V2") {
  throw "Queue vidéo inaccessible ou schéma inattendu."
}
$QueueCompatible = $Queue.source_snapshot_contract -eq "HIBOU_AIRTABLE_SOURCE_SNAPSHOT_V1"
$MissingSnapshots = @($Queue.jobs | Where-Object {
  $_.type -eq "VIDEO_RENDER" -and
  ($null -eq $_.source_snapshot -or $_.source_snapshot.capture_method -ne "server_airtable_live")
})

$SnapshotPreflight = "NOT_REQUESTED"
if ($Storyboard -or $SourceSnapshot) {
  if (-not $Storyboard -or -not $SourceSnapshot) { throw "Fournir -Storyboard et -SourceSnapshot ensemble." }
  if (-not (Test-Path -LiteralPath $Storyboard -PathType Leaf) -or
      -not (Test-Path -LiteralPath $SourceSnapshot -PathType Leaf)) {
    throw "Storyboard ou reçu source local introuvable."
  }
  & $Node $Verifier verify $Storyboard "--source-snapshot=$SourceSnapshot" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Le reçu Airtable ne correspond pas au storyboard ou a expiré." }
  $SnapshotPreflight = "PASS"
}

$Health = $null
try { $Health = Invoke-RestMethod -Uri "http://127.0.0.1:8765/health" -TimeoutSec 3 } catch {}
$WorkerProcesses = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
  $_.Name -eq "node.exe" -and $_.CommandLine -like "*hibou-github-worker.mjs*"
})
$CurrentWorker = $null
if ($Health -and $Health.worker_pid) {
  $CurrentWorker = Get-CimInstance Win32_Process -Filter ("ProcessId=" + [int]$Health.worker_pid) -ErrorAction SilentlyContinue
}
$AlreadyLocal = $Health -and
  ([System.IO.Path]::GetFullPath([string]$Health.worker_source) -eq [System.IO.Path]::GetFullPath($Worker)) -and
  ($Health.worker_self_update_enabled -eq $false)
$HealthMatchesProcess = (-not $Health -and $WorkerProcesses.Count -eq 0) -or
  ($Health -and $CurrentWorker -and $WorkerProcesses.Count -eq 1)
$Idle = $HealthMatchesProcess -and
  (-not $Health -or (-not $Health.current_job -and -not $Health.render_pid))
$Ready = $QueueCompatible -and $MissingSnapshots.Count -eq 0 -and $Idle

$Report = [ordered]@{
  schema = "HIBOU_VIDEO_V5_LOCAL_LAUNCH_READINESS_V1"
  source_root = $SourceRoot
  source_worker_sha256 = (Get-FileHash -LiteralPath $Worker -Algorithm SHA256).Hash.ToLowerInvariant()
  source_master_sha256 = (Get-FileHash -LiteralPath $Master -Algorithm SHA256).Hash.ToLowerInvariant()
  queue_snapshot_contract = [string]$Queue.source_snapshot_contract
  queue_compatible = [bool]$QueueCompatible
  pending_jobs_missing_snapshots = $MissingSnapshots.Count
  snapshot_preflight = $SnapshotPreflight
  creative_qc_python = $CreativePython
  creative_qc_model = $CreativeModel
  creative_qc_local_ready = $true
  current_worker_pid = if ($Health) { $Health.worker_pid } else { $null }
  current_worker_idle = [bool]$Idle
  already_local = [bool]$AlreadyLocal
  ready_for_activation = [bool]$Ready
  v5_runtime_gates = @(
    "HIBOU_VIDEO_TIMELINE_V1",
    "HIBOU_VIDEO_PLANNING_AUDIT_V1",
    "HIBOU_VIDEO_INCREMENTAL_RETOUCH_V1",
    "HIBOU_VIDEO_PROSODY_V1",
    "HIBOU_VIDEO_MUSIC_V1",
    "HIBOU_VIDEO_POSE_REGISTRY_V1",
    "HIBOU_VIDEO_HUMAN_SELECTION_V1",
    "HIBOU_VIDEO_CREATIVE_QC_V1",
    "HIBOU_VIDEO_FACTUAL_GATE_V1"
  )
  airtable_contract_still_required = $true
  activated = $false
  publication_authorized = $false
}
if (-not $Activate) {
  $Report | ConvertTo-Json -Depth 5
  return
}
if (-not $Ready) {
  throw ("Activation V5 refusée : queue_compatible={0}, jobs_sans_snapshot={1}, worker_inactif={2}." -f `
    $QueueCompatible, $MissingSnapshots.Count, $Idle)
}
if ($AlreadyLocal) {
  $Report.activated = $true
  $Report | ConvertTo-Json -Depth 5
  return
}

$InstallDir = Join-Path $env:LOCALAPPDATA "LeHibou"
$OldLauncher = Join-Path $InstallDir "start-hibou-video-stack.runtime.ps1"
$StartupCmd = Join-Path ([Environment]::GetFolderPath("Startup")) "LeHibouWorker.cmd"
$StartupBackup = Join-Path $InstallDir "LeHibouWorker.before-v5.cmd"
$HadStartup = Test-Path -LiteralPath $StartupCmd -PathType Leaf
$StartupWritten = $false
$LocalProcess = $null
$PriorWorkerActive = [bool]$CurrentWorker

try {
  $Watchdogs = @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
    $_.Name -match "^(powershell|pwsh)(\.exe)?$" -and
    $_.CommandLine -like "*run-hibou-worker-watchdog.ps1*" -and
    $_.ProcessId -ne $PID
  })
  foreach ($Process in $Watchdogs) { Stop-Process -Id $Process.ProcessId -Force -ErrorAction Stop }
  if ($CurrentWorker) { Stop-Process -Id $CurrentWorker.ProcessId -Force -ErrorAction Stop }
  Start-Sleep -Milliseconds 500

  $env:HIBOU_VIDEO_LOCAL_SOURCE_ROOT = $SourceRoot
  $env:HIBOU_WORKER_SELF_UPDATE_ENABLED = "false"
  $env:HIBOU_LOCAL_EXECUTION_ENABLED = "true"
  $env:HIBOU_VIDEO_RENDER_ENABLED = "true"
  $env:HIBOU_VIDEO_BINDING = $Binding
  $env:HIBOU_OCR_PYTHON = $OcrPython
  # Runtime capability gates: Airtable/profile flags are still required by video-master.
  # Setting these here means an explicitly activated V5 worker can execute only
  # the V5 features that the exported GLOBAL contract has opted into.
  $env:HIBOU_VIDEO_TIMELINE_V1 = "true"
  $env:HIBOU_VIDEO_PLANNING_AUDIT_V1 = "true"
  $env:HIBOU_VIDEO_INCREMENTAL_RETOUCH_V1 = "true"
  $env:HIBOU_VIDEO_PROSODY_V1 = "true"
  $env:HIBOU_VIDEO_MUSIC_V1 = "true"
  $env:HIBOU_VIDEO_POSE_REGISTRY_V1 = "true"
  $env:HIBOU_VIDEO_HUMAN_SELECTION_V1 = "true"
  $env:HIBOU_VIDEO_CREATIVE_QC_V1 = "true"
  $env:HIBOU_VIDEO_FACTUAL_GATE_V1 = "true"
  $LocalProcess = Start-Process -FilePath $Node -ArgumentList ('"' + $Worker + '"') `
    -WorkingDirectory $SourceRoot -WindowStyle Hidden -PassThru
  $LocalHealth = $null
  for ($Attempt = 0; $Attempt -lt 25; $Attempt++) {
    Start-Sleep -Milliseconds 400
    try { $LocalHealth = Invoke-RestMethod -Uri "http://127.0.0.1:8765/health" -TimeoutSec 2 } catch {}
    if ($LocalHealth -and [int]$LocalHealth.worker_pid -eq $LocalProcess.Id) { break }
  }
  if (-not $LocalHealth -or [int]$LocalHealth.worker_pid -ne $LocalProcess.Id -or
      $LocalHealth.worker_self_update_enabled -ne $false -or
      -not $LocalHealth.execution_enabled -or -not $LocalHealth.video_render_enabled -or
      -not $LocalHealth.report_token_present -or -not $LocalHealth.video_binding_exists) {
    throw "Worker V5 démarré sans santé vérifiable."
  }
  if ($HadStartup) { Copy-Item -LiteralPath $StartupCmd -Destination $StartupBackup -Force }
  $StartupText = '@echo off' + [Environment]::NewLine +
    ('start "" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $PSCommandPath + '" -Activate')
  Set-Content -LiteralPath $StartupCmd -Value $StartupText -Encoding ASCII
  $StartupWritten = $true
  $Report.activated = $true
  $Report.worker_pid = $LocalProcess.Id
  $Report.startup = $StartupCmd
  $Report | ConvertTo-Json -Depth 5
} catch {
  $Failure = $_
  if ($LocalProcess -and -not $LocalProcess.HasExited) {
    try { Stop-Process -Id $LocalProcess.Id -Force -ErrorAction Stop } catch {}
  }
  if ($StartupWritten) {
    if ($HadStartup -and (Test-Path -LiteralPath $StartupBackup)) {
      Copy-Item -LiteralPath $StartupBackup -Destination $StartupCmd -Force
    } else {
      Remove-Item -LiteralPath $StartupCmd -Force -ErrorAction SilentlyContinue
    }
  }
  if ($PriorWorkerActive -and (Test-Path -LiteralPath $OldLauncher -PathType Leaf)) {
    Start-Process -FilePath "powershell.exe" -ArgumentList `
      ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $OldLauncher + '"') `
      -WorkingDirectory $InstallDir -WindowStyle Hidden | Out-Null
  }
  throw "Activation V5 échouée ; restauration de l’ancien lanceur demandée. Détail : $Failure"
}
