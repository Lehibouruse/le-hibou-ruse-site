param()

$ErrorActionPreference = "Stop"

Write-Host "=== Le Hibou Ruse - demarrage stack video ===" -ForegroundColor Cyan

function Get-UserEnv([string]$Name) {
  return [Environment]::GetEnvironmentVariable($Name, "User")
}

function Set-UserEnv([string]$Name, [string]$Value) {
  [Environment]::SetEnvironmentVariable($Name, $Value, "User")
  Set-Item -Path "Env:$Name" -Value $Value
}

$ProjectRoot = Get-UserEnv "HIBOU_PROJECT_ROOT"
if ([string]::IsNullOrWhiteSpace($ProjectRoot)) {
  $ProjectRoot = Join-Path $env:USERPROFILE "le-hibou-ruse-site"
}

$Binding = Get-UserEnv "HIBOU_VIDEO_BINDING"
if ([string]::IsNullOrWhiteSpace($Binding)) {
  $Binding = Join-Path $env:USERPROFILE "Documents\Codex\HibouVideo\comfyui-binding.json"
}

$OutputRoot = Get-UserEnv "HIBOU_VIDEO_OUTPUT_ROOT"
if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
  $OutputRoot = Join-Path $env:USERPROFILE "HibouMedia\video-renders"
}

$Token = Get-UserEnv "HIBOU_LOCAL_REPORT_TOKEN"
if ([string]::IsNullOrWhiteSpace($Token) -or $Token.Length -lt 32) {
  throw "HIBOU_LOCAL_REPORT_TOKEN absent ou invalide dans les variables utilisateur Windows."
}

if (-not (Test-Path $ProjectRoot)) {
  throw "Depot Hibou introuvable : $ProjectRoot"
}
if (-not (Test-Path $Binding)) {
  throw "Binding ComfyUI introuvable : $Binding"
}

$VoicePython = Get-UserEnv "HIBOU_PYTHON"
if ([string]::IsNullOrWhiteSpace($VoicePython)) {
  $VoicePython = Join-Path $env:LOCALAPPDATA "LeHibou\video\chatterbox\venv\Scripts\python.exe"
}
if (-not (Test-Path $VoicePython)) {
  throw "Python Chatterbox introuvable : $VoicePython"
}

$ComfyPortable = Join-Path $env:LOCALAPPDATA "LeHibou\video\comfyui\ComfyUI_windows_portable"
$ComfyMain = Join-Path $ComfyPortable "ComfyUI\main.py"
$Flux = Join-Path $ComfyPortable "ComfyUI\models\checkpoints\flux1-schnell-fp8.safetensors"
if (-not (Test-Path $ComfyMain)) {
  throw "ComfyUI local introuvable : $ComfyMain"
}
if (-not (Test-Path $Flux)) {
  throw "FLUX Schnell FP8 introuvable : $Flux"
}

$Node = (Get-Command node -ErrorAction Stop).Source
$null = Get-Command ffmpeg -ErrorAction Stop
$null = Get-Command ffprobe -ErrorAction Stop

Set-UserEnv "HIBOU_LOCAL_EXECUTION_ENABLED" "true"
Set-UserEnv "HIBOU_VIDEO_RENDER_ENABLED" "true"
Set-UserEnv "HIBOU_VIDEO_AUTOSTART_COMFYUI" "true"
Set-UserEnv "HIBOU_PROJECT_ROOT" $ProjectRoot
Set-UserEnv "HIBOU_VIDEO_BINDING" $Binding
Set-UserEnv "HIBOU_VIDEO_OUTPUT_ROOT" $OutputRoot
Set-UserEnv "HIBOU_PYTHON" $VoicePython

New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null

Write-Host "Preflight local..." -ForegroundColor Cyan
& $Node (Join-Path $ProjectRoot "scripts\video-local-preflight.mjs") --require-ready
if ($LASTEXITCODE -ne 0) {
  throw "Le preflight video local a echoue."
}

Write-Host "Test de la queue VIDEO_RENDER authentifiee..." -ForegroundColor Cyan
$headers = @{
  Authorization = "Bearer $Token"
  "User-Agent" = "Le-Hibou-Video-Stack-Bootstrap/1.0"
}
try {
  $queue = Invoke-RestMethod -Uri ("https://d4d5d6.com/api/local-worker-queue?t=" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()) -Headers $headers -Method Get -TimeoutSec 20
} catch {
  $status = $null
  try { $status = [int]$_.Exception.Response.StatusCode } catch {}
  if ($status) {
    throw "Queue VIDEO_RENDER inaccessible (HTTP $status). Verifier le secret Vercel HIBOU_LOCAL_REPORT_TOKEN et son scope projet."
  }
  throw "Queue VIDEO_RENDER inaccessible : $($_.Exception.Message)"
}
if (-not $queue.ok -or $queue.schema -ne "HIBOU_VIDEO_RENDER_QUEUE_V2") {
  throw "Reponse queue VIDEO_RENDER inattendue."
}
Write-Host ("Queue authentifiee OK - jobs visibles : {0}" -f @($queue.jobs).Count) -ForegroundColor Green

$RuntimeCommit = ([string]$queue.runtime_commit).Trim()
if ([string]::IsNullOrWhiteSpace($RuntimeCommit) -or $RuntimeCommit.Length -ne 40) {
  throw "Queue VIDEO_RENDER sans runtime_commit valide."
}
foreach ($ch in $RuntimeCommit.ToCharArray()) {
  if ("0123456789abcdefABCDEF".IndexOf($ch) -lt 0) {
    throw "Queue VIDEO_RENDER avec runtime_commit non hexadecimal."
  }
}
$RuntimeCommit = $RuntimeCommit.ToLowerInvariant()
Write-Host ("Runtime deploye : {0}" -f $RuntimeCommit) -ForegroundColor Green

$FailedJobsPath = Join-Path $env:LOCALAPPDATA "LeHibou\failed-jobs.json"
if ((Test-Path $FailedJobsPath) -and @($queue.jobs).Count -gt 0) {
  try {
    $failedJobs = Get-Content -Raw $FailedJobsPath | ConvertFrom-Json
    $cleared = 0
    foreach ($job in @($queue.jobs)) {
      if ($null -ne $failedJobs -and $null -ne $failedJobs.PSObject.Properties[$job.id]) {
        $failedJobs.PSObject.Properties.Remove($job.id)
        $cleared += 1
      }
    }
    if ($cleared -gt 0) {
      $failedJobs | ConvertTo-Json -Depth 8 | Set-Content -Path $FailedJobsPath -Encoding UTF8
      Write-Host ("Backoff local leve pour {0} job(s) VIDEO_RENDER Pending." -f $cleared) -ForegroundColor Green
    }
  } catch {
    throw "Impossible de lever proprement le backoff local VIDEO_RENDER : $($_.Exception.Message)"
  }
}

$InstallDir = Join-Path $env:LOCALAPPDATA "LeHibou"
$Worker = Join-Path $InstallDir "hibou-github-worker.mjs"
$RuntimeMaster = Join-Path $InstallDir "video-master.runtime.mjs"
$RuntimeVoice = Join-Path $InstallDir "chatterbox-storyboard-batch.runtime.py"

$RawBase = "https://raw.githubusercontent.com/Lehibouruse/le-hibou-ruse-site/$RuntimeCommit"
$WorkerUrl = "$RawBase/scripts/hibou-github-worker.mjs"
$MasterUrl = "$RawBase/scripts/video-master.mjs"
$VoiceUrl = "$RawBase/scripts/chatterbox-storyboard-batch.py"

New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

Set-UserEnv "HIBOU_VIDEO_MASTER_SCRIPT" $RuntimeMaster
Set-UserEnv "HIBOU_CHATTERBOX_BATCH_SCRIPT" $RuntimeVoice

Write-Host ("Actualisation des runtimes video depuis le commit deploye {0}..." -f $RuntimeCommit) -ForegroundColor Cyan
$cacheBust = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$freshHeaders = @{ "Cache-Control" = "no-cache"; "Pragma" = "no-cache" }
Invoke-WebRequest -UseBasicParsing -Headers $freshHeaders -Uri ($WorkerUrl + "?hibou_cb=" + $cacheBust) -OutFile $Worker
Invoke-WebRequest -UseBasicParsing -Headers $freshHeaders -Uri ($MasterUrl + "?hibou_cb=" + $cacheBust) -OutFile $RuntimeMaster
Invoke-WebRequest -UseBasicParsing -Headers $freshHeaders -Uri ($VoiceUrl + "?hibou_cb=" + $cacheBust) -OutFile $RuntimeVoice

$voiceSource = Get-Content -Raw $RuntimeVoice
if ($voiceSource -notmatch 'inspect\.signature\(ChatterboxMultilingualTTS\.from_pretrained\)') {
  throw "Runtime Chatterbox stale ou invalide: marqueur compatibilite API absent."
}
$masterSource = Get-Content -Raw $RuntimeMaster
if ($masterSource -notmatch 'pathToFileURL\(resolve\(process\.argv\[1\]\)\)\.href') {
  throw "Runtime video-master stale ou invalide: entrypoint portable absent."
}

& $Node --check $Worker
if ($LASTEXITCODE -ne 0) {
  throw "Le worker telecharge ne passe pas node --check."
}
& $Node --check $RuntimeMaster
if ($LASTEXITCODE -ne 0) {
  throw "Le video-master runtime ne passe pas node --check."
}
& $VoicePython -m py_compile $RuntimeVoice
if ($LASTEXITCODE -ne 0) {
  throw "Le batch Chatterbox runtime ne passe pas py_compile."
}

$RuntimeLauncher = Join-Path $InstallDir "start-hibou-video-stack.runtime.ps1"
$CurrentLauncher = [System.IO.Path]::GetFullPath($PSCommandPath)
$InstalledLauncher = [System.IO.Path]::GetFullPath($RuntimeLauncher)
if ($CurrentLauncher -ne $InstalledLauncher) {
  Copy-Item -LiteralPath $CurrentLauncher -Destination $RuntimeLauncher -Force
}

$WatchdogScript = Join-Path $InstallDir "run-hibou-worker-watchdog.ps1"
$WatchdogContent = @"
`$ErrorActionPreference = "Continue"

function Stop-HibouRenderChildren {
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      (`$_.Name -eq "node.exe" -and `$_.CommandLine -like "*video-master.runtime.mjs*") -or
      (`$_.Name -eq "node.exe" -and `$_.CommandLine -like "*\\LeHibou\\image-runtime\\*") -or
      (`$_.Name -match "^python(\\.exe)?$" -and `$_.CommandLine -like "*chatterbox-storyboard-batch.runtime.py*")
    } |
    ForEach-Object {
      try { Stop-Process -Id `$_.ProcessId -Force -ErrorAction Stop } catch {}
    }
}

while (`$true) {
  `$child = `$null
  try {
    `$child = Start-Process -FilePath "$Node" -ArgumentList '"$Worker"' -WorkingDirectory "$InstallDir" -WindowStyle Hidden -PassThru
    `$unhealthy = 0

    while (-not `$child.HasExited) {
      Start-Sleep -Seconds 10
      `$healthy = `$false
      `$renderPid = 0

      try {
        `$health = Invoke-RestMethod -Uri "http://127.0.0.1:8765/health" -TimeoutSec 3
        if (`$health -and [int]`$health.worker_pid -eq `$child.Id) {
          `$healthy = `$true
          if (`$health.render_pid) {
            `$renderPid = [int]`$health.render_pid
          }
          if (`$health.current_job -and `$health.render_pid -and `$health.last_video_heartbeat_at) {
            `$last = [DateTimeOffset]::Parse([string]`$health.last_video_heartbeat_at)
            `$ageSeconds = ([DateTimeOffset]::UtcNow - `$last.ToUniversalTime()).TotalSeconds
            if (`$ageSeconds -gt 120) {
              `$healthy = `$false
            }
          }
        }
      } catch {}

      if (`$healthy) {
        `$unhealthy = 0
      } else {
        `$unhealthy += 1
      }

      if (`$unhealthy -ge 3) {
        if (`$renderPid -gt 0) {
          try { Stop-Process -Id `$renderPid -Force -ErrorAction Stop } catch {}
        }
        try { Stop-Process -Id `$child.Id -Force -ErrorAction Stop } catch {}
        break
      }
    }

    if (`$child -and -not `$child.HasExited) {
      try { `$child.WaitForExit() } catch {}
    }
  } catch {}

  Stop-HibouRenderChildren
  Start-Sleep -Seconds 5
}
"@
Set-Content -Path $WatchdogScript -Value $WatchdogContent -Encoding UTF8

$StartupDir = [Environment]::GetFolderPath("Startup")
$StartupCmd = Join-Path $StartupDir "LeHibouWorker.cmd"
$CmdContent = @"
@echo off
start "" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "$RuntimeLauncher"
"@
Set-Content -Path $StartupCmd -Value $CmdContent -Encoding ASCII

Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object {
    $_.ProcessId -ne $PID -and
    (
      ($_.Name -eq "node.exe" -and $_.CommandLine -like "*hibou-github-worker.mjs*") -or
      ($_.Name -eq "node.exe" -and $_.CommandLine -like "*video-master.runtime.mjs*") -or
      ($_.Name -eq "node.exe" -and $_.CommandLine -like "*\LeHibou\image-runtime\*") -or
      ($_.Name -match "^python(\.exe)?$" -and $_.CommandLine -like "*chatterbox-storyboard-batch.runtime.py*") -or
      ($_.Name -match "^powershell(\.exe)?$|^pwsh(\.exe)?$" -and $_.CommandLine -like "*run-hibou-worker-watchdog.ps1*")
    )
  } |
  ForEach-Object {
    try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {}
  }

Start-Sleep -Milliseconds 500
Start-Process -FilePath "powershell.exe" -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $WatchdogScript + '"') -WorkingDirectory $InstallDir -WindowStyle Hidden

$health = $null
for ($i = 0; $i -lt 20; $i++) {
  Start-Sleep -Milliseconds 500
  try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:8765/health" -TimeoutSec 2
    if ($health) { break }
  } catch {}
}

if (-not $health) {
  throw "Worker lance mais endpoint health indisponible."
}
if (-not $health.execution_enabled) {
  throw "Worker actif mais execution_enabled=false."
}
if (-not $health.video_render_enabled) {
  throw "Worker actif mais video_render_enabled=false."
}
if (-not $health.video_autostart_comfyui) {
  throw "Worker actif mais video_autostart_comfyui=false."
}
if (-not $health.report_token_present) {
  throw "Worker actif mais token absent."
}
if (-not $health.video_binding_exists) {
  throw "Worker actif mais binding ComfyUI introuvable."
}
if (-not $health.video_master_script_exists) {
  throw "Worker actif mais video-master runtime introuvable."
}

[ordered]@{
  schema = "HIBOU_VIDEO_STACK_READY_V1"
  worker = $health.worker
  status = $health.status
  execution_enabled = $health.execution_enabled
  video_render_enabled = $health.video_render_enabled
  video_autostart_comfyui = $health.video_autostart_comfyui
  report_token_present = $health.report_token_present
  video_binding_exists = $health.video_binding_exists
  video_output_root = $health.video_output_root
  video_master_script = $health.video_master_script
  video_master_script_exists = $health.video_master_script_exists
  chatterbox_batch_script = $RuntimeVoice
  runtime_commit = $RuntimeCommit
  startup = $StartupCmd
  watchdog = $WatchdogScript
  queue_jobs_visible = @($queue.jobs).Count
} | ConvertTo-Json -Depth 4

Write-Host "HIBOU_VIDEO_STACK_READY" -ForegroundColor Green
