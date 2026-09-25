# Premier lancement local — PC gaming Windows

Le matériel exact doit être détecté localement avant tout téléchargement/génération lourde. Les seules informations utilisateur actuellement fiables sont : PC gaming Windows, Intel Core i9 et NVIDIA GeForce RTX.

Profil canonique : `video/hardware/detect-at-runtime.json`.

Le diagnostic runtime sert à établir le modèle GPU, la VRAM, le pilote/CUDA visible, la RAM et l’espace disque réellement disponibles.

## 1. Diagnostic

```powershell
npm run video:gpu-check:windows
node scripts/video-local-preflight.mjs
```

Aucun modèle n'est téléchargé et aucun fallback payant n'est activé.

## 2. Voix — une scène

Après validation du préflight et installation locale de Chatterbox :

```powershell
npm run video:smoke -- video/contracts/obo.v1.json .hibou-video-artifacts/smoke-obo --scene=1 --run-voice
```

## 3. Image — profil selon la VRAM réellement mesurée

Exporter un workflow ComfyUI au format API puis détecter ses vrais nœuds :

```powershell
npm run video:comfyui-binding -- C:\chemin\workflow-api.json C:\chemin\hibou-binding-candidate.json
```

Repères :
- ≥ 12 Go : smoke local confortable puis mesure ;
- 8–12 Go : profil low-VRAM, batch 1, candidats séquentiels, FP8/quantification adaptée ;
- < 8 Go : modèle/résolution plus légers avant d'envisager FLUX.

```powershell
npm run video:smoke -- video/contracts/obo.v1.json .hibou-video-artifacts/smoke-obo C:\chemin\hibou-binding.json --scene=1 --run-image
```

## 4. Smoke complet

```powershell
npm run video:smoke -- video/contracts/obo.v1.json .hibou-video-artifacts/smoke-obo C:\chemin\hibou-binding.json --scene=1 --run-voice --run-image
npm run video:smoke-report -- summarize .hibou-video-artifacts/smoke-obo
```

Le statut `LOCAL_SMOKE_PASS — FULL_PIPELINE_NOT_RUN` n'autorise aucune publication.

## 5. Montée en charge

1. une scène ;
2. trois scènes ;
3. rendu FFmpeg + QC ;
4. pilote complet ;
5. lecture iPhone ;
6. généralisation.

Garde-fous : loopback uniquement, aucun fallback API payant, aucun gros modèle avant diagnostic, arrêt sur OOM plutôt que bascule cloud, modèles/caches/médias hors Git et Vercel.
