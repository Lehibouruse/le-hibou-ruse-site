$ErrorActionPreference = "SilentlyContinue"

function CmdExists($name) {
  return [bool](Get-Command $name -ErrorAction SilentlyContinue)
}

$result = [ordered]@{
  checked_at = (Get-Date).ToString("o")
  os = [System.Environment]::OSVersion.VersionString
  gpu = @()
  nvidia_smi_available = $false
  cuda_driver_version = $null
  python_available = (CmdExists "python")
  python_version = $null
  ffmpeg_available = (CmdExists "ffmpeg")
  ffmpeg_version = $null
  recommendation = $null
}

if ($result.python_available) {
  $result.python_version = (& python --version 2>&1 | Select-Object -First 1)
}
if ($result.ffmpeg_available) {
  $result.ffmpeg_version = (& ffmpeg -version 2>&1 | Select-Object -First 1)
}

if (CmdExists "nvidia-smi") {
  $result.nvidia_smi_available = $true
  $rows = & nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader,nounits 2>$null
  foreach ($row in $rows) {
    $parts = $row -split "," | ForEach-Object { $_.Trim() }
    if ($parts.Count -ge 3) {
      $vram = [int]$parts[1]
      $result.gpu += [ordered]@{
        name = $parts[0]
        vram_mb = $vram
        vram_gb = [math]::Round($vram / 1024, 1)
        driver_version = $parts[2]
      }
    }
  }
  $header = & nvidia-smi 2>$null | Select-Object -First 3
  $cudaLine = $header | Where-Object { $_ -match "CUDA Version:" } | Select-Object -First 1
  if ($cudaLine -match "CUDA Version:\s*([0-9.]+)") {
    $result.cuda_driver_version = $Matches[1]
  }
}

$maxVram = 0
if ($result.gpu.Count -gt 0) {
  $maxVram = ($result.gpu | Measure-Object -Property vram_gb -Maximum).Maximum
}
if (-not $result.nvidia_smi_available) {
  $result.recommendation = "NVIDIA non detectee via nvidia-smi : verifier pilote NVIDIA et modele GPU."
} elseif ($maxVram -ge 16) {
  $result.recommendation = "Tres bon candidat pour le pipeline local FLUX + Chatterbox. Tester le profil qualite elevee."
} elseif ($maxVram -ge 12) {
  $result.recommendation = "Bon candidat. FLUX/Chatterbox devraient etre testables avec reglages memoire raisonnables."
} elseif ($maxVram -ge 8) {
  $result.recommendation = "Probablement exploitable, mais utiliser profils economes en VRAM / offload et tester scene par scene."
} elseif ($maxVram -gt 0) {
  $result.recommendation = "GPU NVIDIA detecte mais VRAM limitee pour ce pipeline. Envisager modeles plus legers ou GPU distant."
} else {
  $result.recommendation = "Impossible de determiner la VRAM."
}

$out = $result | ConvertTo-Json -Depth 5
$out
$out | Set-Content -Encoding UTF8 ".\hibou-gpu-check.json"
Write-Host ""
Write-Host "Rapport ecrit dans hibou-gpu-check.json"
