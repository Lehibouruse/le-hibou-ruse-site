# Premier lancement local — ASUS ROG Strix G18 G814JI

Matériel de référence vérifié pour Le Hibou Rusé :
- Intel Core i9-13980HX ;
- NVIDIA GeForce RTX 4070 Laptop GPU — 8 Go de VRAM ;
- 32 Go de RAM ;
- SSD NVMe ~1 To.

Le profil machine canonique est `video/hardware/rog-g814ji-rtx4070-8gb.json`.

## 1. Vérification rapide

```powershell
npm run video:gpu-check:windows
node scripts/video-local-preflight.mjs
```

Le diagnostic reste utile pour vérifier pilote/CUDA/Python/FFmpeg, mais le choix d’architecture n’est plus en attente du modèle GPU.

## 2. Voix d’abord — Chatterbox Multilingual

Utiliser Python 3.11 et CUDA. Premier test : une seule scène OBO.

```powershell
npm run video:smoke -- video/contracts/obo.v1.json .hibou-video-artifacts/smoke-obo --scene=1 --run-voice
```

Critère de passage : WAV français intelligible, durée mesurée, aucun mot coupé, aucun fallback cloud/payant.

## 3. Image — profil 8 Go

Premier modèle : **FLUX.1-schnell FP8** dans ComfyUI local. Ne pas commencer par FLUX FP16 complet.

Profil smoke :
- 768 × 1344 ;
- batch 1 ;
- 4 steps ;
- 3 candidats générés séquentiellement.

Fallback si CUDA OOM ou pression RAM excessive :
- 640 × 1136 ;
- batch 1 ;
- 4 steps.

Le renderer final reste 1080 × 1920.

Exporter le workflow ComfyUI au format API puis détecter automatiquement les nœuds :

```powershell
npm run video:comfyui-binding -- C:\chemin\workflow-api.json C:\chemin\hibou-binding-candidate.json
```

Le binding proposé détecte prompt, seed, dimensions et sortie image. Vérifier visuellement ces IDs avant le premier run.

Puis :

```powershell
npm run video:smoke -- video/contracts/obo.v1.json .hibou-video-artifacts/smoke-obo C:\chemin\hibou-binding.json --scene=1 --run-image
```

Attendu : trois images distinctes, batch 1, seeds déterministes et manifeste persistant.

## 4. Smoke complet

```powershell
npm run video:smoke -- video/contracts/obo.v1.json .hibou-video-artifacts/smoke-obo C:\chemin\hibou-binding.json --scene=1 --run-voice --run-image
npm run video:smoke-report -- summarize .hibou-video-artifacts/smoke-obo
```

Le statut réussi est volontairement `LOCAL_SMOKE_PASS — FULL_PIPELINE_NOT_RUN`. Il n’autorise aucune publication.

## 5. Passage au pilote

Seulement après revue humaine de la scène smoke :
1. 3 scènes ;
2. rendu FFmpeg ;
3. QC technique ;
4. pilote 18 scènes ;
5. revue iPhone ;
6. seulement ensuite généralisation.

## Garde-fous

- ComfyUI uniquement en loopback/local ;
- aucun fallback API payant ;
- aucun lancement simultané de plusieurs candidats sur 8 Go ;
- pas de FLUX FP16 complet au premier run ;
- caches et modèles hors Git/Vercel ;
- arrêter sur OOM plutôt que basculer vers le cloud ;
- conserver modèle, précision, dimensions, seed, hashes et temps de génération.
