# Installation locale vidéo Hibou — Windows

Cette procédure sépare volontairement **diagnostic**, **voix**, **ComfyUI** et **modèle FLUX**. Une invocation sans switch ne fait qu'un diagnostic local : aucun modèle, paquet lourd ou service n'est installé ou démarré.

## 1. Diagnostic uniquement

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\video-local-install-windows.ps1
```

Le diagnostic utilise le préflight Hibou existant. Tant que GPU NVIDIA, espace disque et prérequis ne sont pas cohérents, les étapes lourdes s'arrêtent.

## 2. Installer la voix

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\video-local-install-windows.ps1 -InstallVoice
```

Le script crée un venv Python 3.11 isolé, installe PyTorch 2.6.0 CUDA 12.4 puis `chatterbox-tts==0.1.7`, et refuse de valider si `torch.cuda.is_available()` est faux. Le chargement des poids TTS n'est pas déclenché par l'installation ; il intervient au premier smoke test.

## 3. Installer ComfyUI

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\video-local-install-windows.ps1 -InstallComfyUI
```

Le portable NVIDIA officiel est téléchargé et extrait sous `%LOCALAPPDATA%\LeHibou\video\comfyui`. Il n'est pas démarré automatiquement.

## 4. Télécharger explicitement FLUX Schnell FP8

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\video-local-install-windows.ps1 -InstallFluxSchnell
```

Cette étape est séparée parce que le checkpoint est volumineux. Le téléchargement est reprenable et son SHA-256 officiel attendu est vérifié avant utilisation. Le fichier est placé dans `ComfyUI\models\checkpoints`.

## 5. Démarrer ComfyUI explicitement

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\video-start-comfyui-windows.ps1
```

Le serveur écoute uniquement sur `127.0.0.1:8188` et démarre avec `--lowvram`. Aucun tunnel public n'est configuré.

## 6. Smoke test

Après installation voix + image, reprendre `docs/video-first-run-windows.md` : une scène OBO, une voix, trois images, puis rapport `LOCAL_SMOKE_PASS — FULL_PIPELINE_NOT_RUN`.

## Références techniques figées

- Chatterbox : `chatterbox-tts==0.1.7`, Python 3.11, PyTorch/Torchaudio 2.6.0 CUDA 12.4.
- ComfyUI : portable NVIDIA officiel `ComfyUI_windows_portable_nvidia.7z`.
- FLUX : `Comfy-Org/flux1-schnell/flux1-schnell-fp8.safetensors`.
- Aucun fallback API payant.
