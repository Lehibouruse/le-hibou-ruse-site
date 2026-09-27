param(
  [int]$Port = 8188
)

# COMFYUI_AUTOSTART_V2
$ErrorActionPreference = "Stop"
$VideoRoot = Join-Path $env:LOCALAPPDATA "LeHibou\video"
$Portable = Join-Path $VideoRoot "comfyui\ComfyUI_windows_portable"
$Python = Join-Path $Portable "python_embeded\python.exe"
$Main = Join-Path $Portable "ComfyUI\main.py"
$LogDir = Join-Path $env:LOCALAPPDATA "LeHibou\logs"
$Stdout = Join-Path $LogDir "comfyui-autostart.stdout.log"
$Stderr = Join-Path $LogDir "comfyui-autostart.stderr.log"
$State = Join-Path $LogDir "comfyui-autostart-state.json"

if (-not (Test-Path $Python) -or -not (Test-Path $Main)) {
  throw "ComfyUI portable Hibou introuvable. Lancer d'abord video-local-install-windows.ps1 -InstallComfyUI."
}
if ($Port -lt 1024 -or $Port -gt 65535) { throw "Port invalide." }

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
  Where-Object {
    $_.Name -match '^python(\.exe)?$' -and
    $_.CommandLine -like "*ComfyUI\main.py*" -and
    $_.CommandLine -like "*$Portable*"
  } |
  ForEach-Object {
    try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop } catch {}
  }

Start-Sleep -Milliseconds 750

$args = @(
  "-s",
  $Main,
  "--windows-standalone-build",
  "--listen", "127.0.0.1",
  "--port", [string]$Port,
  "--lowvram"
)

Write-Host "ComfyUI Hibou : loopback uniquement, low VRAM, port $Port" -ForegroundColor Cyan
$child = Start-Process -FilePath $Python -ArgumentList $args -WorkingDirectory $Portable -RedirectStandardOutput $Stdout -RedirectStandardError $Stderr -WindowStyle Hidden -PassThru

[ordered]@{
  schema = "HIBOU_COMFYUI_AUTOSTART_V2"
  started_at = [DateTimeOffset]::UtcNow.ToString("o")
  pid = $child.Id
  port = $Port
  python = $Python
  main = $Main
  working_directory = $Portable
  stdout = $Stdout
  stderr = $Stderr
} | ConvertTo-Json -Depth 4 | Set-Content -Path $State -Encoding UTF8

Write-Host ("COMFYUI_AUTOSTART_V2 pid={0} state={1}" -f $child.Id, $State) -ForegroundColor Green
