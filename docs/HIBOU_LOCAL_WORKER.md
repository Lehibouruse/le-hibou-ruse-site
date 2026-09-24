# Hibou Local Worker — ROG

## But

Transformer le ROG de Marc en worker local sans port public et sans cloud payant pour les tâches média lourdes. Airtable sert de file de commandes. Le ROG interroge la table `Local Worker Queue` toutes les 15 secondes, exécute localement les tâches autorisées, puis écrit le résultat dans Airtable.

Matériel cible validé :

- ASUS ROG Strix G18 G814JI ;
- Intel Core i9-13980HX, 24 cœurs / 32 threads ;
- NVIDIA GeForce RTX 4070 Laptop, 8 Go VRAM ;
- 32 Go RAM ;
- environ 1 To SSD NVMe.

## Architecture V1

```text
ChatGPT / Airtable
       |
       v
Local Worker Queue
       |
       | HTTPS sortant uniquement
       v
ROG Windows
  ├─ yt-dlp : collecte de vidéos publiques
  ├─ FFmpeg : normalisation / extraction / rendu
  ├─ futur ComfyUI : images locales
  ├─ futur Chatterbox : voix locale
  └─ stockage %USERPROFILE%\HibouMedia
       |
       v
Airtable : statut + métadonnées + hashes
```

Le worker n'ouvre aucun tunnel, n'expose aucun port sur Internet et ne stocke aucun secret dans GitHub/Airtable.

## Installation

Depuis PowerShell dans le dépôt :

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\install-hibou-local-worker.ps1
```

Le script installe/vérifie Node, Git, yt-dlp et FFmpeg, demande une seule fois un token Airtable, crée une tâche Windows au logon et lance un test réel.

## Job test déjà créé

Table Airtable : `Local Worker Queue` (`tbl8VTZsY6uv3z9Y7`).

Premier job :

- `test-renard-prix-transfert`
- type `DOWNLOAD_VIDEO`
- URL `https://www.youtube.com/watch?v=pqm2Cu-TDEY`
- 1080p maximum
- info JSON
- miniature
- sous-titres FR/EN disponibles
- fusion MP4

Une fois le worker installé, ce job doit passer automatiquement de `Pending` à `Running`, puis `Completed`, avec le chemin local et le SHA-256 du fichier.

## Tâches autorisées en V1

- `DOWNLOAD_VIDEO`
- `DOWNLOAD_BATCH`

Hôtes autorisés :

- YouTube ;
- Instagram ;
- TikTok.

Le worker ne contourne pas de DRM. Les éventuelles authentifications de navigateur restent locales et ne sont utilisées que si `cookies_from_browser` est explicitement ajouté dans `Options JSON`.

## Format Options JSON

```json
{
  "max_height": 1080,
  "write_info_json": true,
  "write_thumbnail": true,
  "write_subtitles": true,
  "subtitle_languages": ["fr", "en"],
  "merge_mp4": true
}
```

Option locale facultative pour une plateforme nécessitant une session déjà ouverte :

```json
{
  "cookies_from_browser": "chrome"
}
```

Valeurs admises : `chrome`, `edge`, `firefox`.

## Stockage

Par défaut :

```text
%USERPROFILE%\HibouMedia\competitors\<concurrent>\<job>\...
```

Les fichiers lourds restent hors Git/Vercel/Airtable. Airtable ne reçoit que l'état, le chemin local, les métadonnées, erreurs et hashes.

## Observabilité

Health local, uniquement loopback :

```text
http://127.0.0.1:8765/health
```

Logs :

```text
%LOCALAPPDATA%\LeHibou\worker.log
```

## Étape suivante

Après validation du téléchargement réel sur le ROG :

1. extraction automatique des frames/cuts via FFmpeg ;
2. transcription locale Whisper/faster-whisper ;
3. métriques visuelles : durée plans, densité texte, rythme, zooms ;
4. raccordement au registre de veille concurrentielle ;
5. branchement ComfyUI/FLUX et Chatterbox de la PR vidéo pour faire du ROG le worker complet de production.

Le design reste local-first, gratuit/quasi gratuit, automatisé et compatible avec la limite de 8 Go VRAM.
