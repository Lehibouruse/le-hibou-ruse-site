param(
  [int]$Port = 8188
)

$ErrorActionPreference = "Stop"
$VideoRoot = Join-Path $env:LOCALAPPDATA "LeHibou\video"
$Portable = Join-Path $VideoRoot "comfyui\ComfyUI_windows_portable"
$Python = Join-Path $Portable "python_embeded\python.exe"
$Main = Join-Path $Portable "ComfyUI\main.py"

if (-not (Test-Path $Python) -or -not (Test-Path $Main)) {
  throw "ComfyUI portable Hibou introuvable. Lancer d'abord video-local-install-windows.ps1 -InstallComfyUI."
}
if ($Port -lt 1024 -or $Port -gt 65535) { throw "Port invalide." }

Write-Host "ComfyUI Hibou : loopback uniquement, low VRAM, port $Port" -ForegroundColor Cyan
& $Python -s $Main --listen 127.0.0.1 --port $Port --lowvram
