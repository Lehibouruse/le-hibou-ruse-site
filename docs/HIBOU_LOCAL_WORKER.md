# Hibou Local Worker — ROG

## But

Transformer le ROG de Marc en worker local sans port public et sans cloud payant pour les tâches média lourdes. Airtable sert de file de commandes. Le ROG interroge la table `Local Worker Queue` toutes les 15 secondes, exécute localement les tâches autorisées, puis écrit le résultat dans Airtable.

Matériel cible : PC gaming Windows de Marc avec Intel Core i9 et NVIDIA GeForce RTX. Le modèle exact, la VRAM, la RAM et le stockage doivent être relevés par diagnostic avant toute hypothèse de capacité. Ne pas considérer un modèle ROG précis comme confirmé tant que le rapport GPU réel n'a pas été obtenu.

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

Le script installe/vérifie Node, Git, yt-dlp et FFmpeg, demande une seule fois un token Airtable et crée une tâche Windows au logon. **Par défaut il ne démarre pas le worker et ne télécharge rien.** Il exécute seulement un diagnostic local sans réseau. Pour démarrer explicitement après validation : ajouter `-StartWorker`.

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

Le job de validation reste **Paused** tant que le PC et le worker n'ont pas été validés. Il ne doit être remis en `Pending` qu'après démarrage explicite du worker.

## Tâches autorisées en V1

- `DOWNLOAD_VIDEO`
- `DOWNLOAD_BATCH`

Hôtes autorisés :

- YouTube ;
- Instagram ;
- TikTok.

Le worker ne contourne pas de DRM. La V1 refuse explicitement `cookies_from_browser` : une commande Airtable ne peut pas demander au worker de lire les cookies du navigateur.

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

Le design reste local-first, gratuit/quasi gratuit et automatisé. Les réglages image/voix seront choisis après mesure de la VRAM réelle.


## Reporting distant optionnel

Le téléchargement local peut rester **sans token serveur**. Le reporting vers `/api/local-worker-status` est une capacité séparée et désactivée si aucun secret n'est fourni.

Pour l'activer, `HIBOU_LOCAL_REPORT_TOKEN` doit être configuré **à la fois** :
- côté serveur/Vercel ;
- localement sur le PC worker.

Le worker envoie alors `Authorization: Bearer …`. Sans token local, il saute le reporting. Sans token serveur, l'endpoint renvoie `503 reporting_disabled`. Le bootstrap ne crée ni ne demande ce secret automatiquement.
