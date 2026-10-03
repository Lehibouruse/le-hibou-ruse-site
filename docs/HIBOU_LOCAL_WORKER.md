# Hibou Local Worker — architecture canonique

## But

Le worker local transforme le PC Windows de Marc en exécuteur média local-first pour les tâches lourdes : collecte de vidéos publiques autorisées, forensic FFmpeg/Whisper, puis à terme génération et rendu vidéo. Il n'expose aucun port public et ne dépend d'aucun token Airtable pour lire la file de travail.

Le modèle exact, la VRAM réellement disponible, le pilote/CUDA, la RAM et l'espace disque doivent être relevés par le diagnostic runtime avant de choisir un profil de génération lourd. L'inventaire nominal de la machine sert au dimensionnement, pas de preuve de disponibilité au moment du run.

## Architecture canonique

```text
GitHub main
  ├─ config/local-worker-queue.json       file publique, lecture seule
  └─ scripts/hibou-github-worker.mjs      worker canonique
              |
              | HTTPS sortant
              v
ROG Windows
  ├─ opt-in global local obligatoire
  ├─ approbation locale exacte des jobs
  ├─ yt-dlp / FFmpeg
  ├─ forensic local
  ├─ futur ComfyUI / Chatterbox
  └─ %USERPROFILE%\HibouMedia
              |
              +--> health loopback 127.0.0.1:8765
              |
              +--> reporting distant optionnel, authentifié séparément
```

Airtable n'est **plus** la file d'exécution du worker. Il reçoit éventuellement de la télémétrie via l'endpoint serveur authentifié ; le worker n'a donc pas besoin d'un PAT Airtable pour exécuter les jobs média.

## Les trois verrous d'exécution

Une entrée active dans GitHub ne suffit jamais à lancer un job.

1. `HIBOU_LOCAL_EXECUTION_ENABLED=true` doit être activé localement.
2. Le job exact doit être approuvé localement via :
   - `%LOCALAPPDATA%\LeHibou\approved-jobs.json`, ou
   - `HIBOU_LOCAL_APPROVED_JOB_ID` pour un job unique.
3. Le job doit être d'un type et viser un hôte autorisés par le worker.

Sans le premier verrou, le worker reste `paused`. Sans approbation locale, il reste `waiting_local_job_approval`.

## Installation / mise à jour

La voie canonique est :

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-hibou-local-worker.ps1
```

Sans option, le bootstrap :

- installe/vérifie les outils requis ;
- télécharge la version courante du worker canonique ;
- positionne `HIBOU_LOCAL_EXECUTION_ENABLED=false` ;
- lance uniquement le diagnostic local ;
- ne télécharge aucun média ;
- ne demande aucun token Airtable.

Pour autoriser explicitement le corpus prévu puis démarrer :

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-hibou-local-worker.ps1 -ApproveCorpus150 -StartWorker
```

Ou, pour ajouter uniquement la vague rééquilibrée prévue :

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\bootstrap-hibou-local-worker.ps1 -ApproveBalancedNight -StartWorker
```

Ces switches écrivent des IDs exacts dans le manifeste local d'approbation. Ils ne constituent pas une autorisation générique de commandes futures.

## Ancienne voie Airtable directe

`scripts/hibou-local-worker.mjs` est conservé uniquement pour historique/diagnostic. Il est **fail-closed** : aucune exécution de job n'est permise par défaut.

`scripts/install-hibou-local-worker.ps1` est également conservé pour compatibilité, mais redirige désormais vers le bootstrap tokenless canonique et ne demande plus de PAT Airtable.

Un opt-in `HIBOU_ENABLE_LEGACY_AIRTABLE_WORKER=true` existe uniquement pour reprise contrôlée d'un ancien environnement. Il ne doit pas être utilisé dans le fonctionnement normal.

## Tâches autorisées

Le worker GitHub accepte uniquement les types explicitement codés, actuellement :

- `DOWNLOAD_VIDEO`
- `DOWNLOAD_BATCH`
- `DOWNLOAD_PROFILE_TOP_SHORTS`

Hôtes de collecte autorisés :

- YouTube ;
- Instagram ;
- TikTok.

Il ne contourne pas de DRM et n'extrait pas les cookies navigateur sur instruction distante.

Pour `DOWNLOAD_PROFILE_TOP_SHORTS`, la découverte reste bornée ; la sélection utilise les vues lorsqu'elles sont réellement disponibles, sinon l'ordre du profil. Une erreur sur un élément peut être isolée sans bloquer tout le corpus.

## Priorité média

Le téléchargement MP4 est prioritaire. Les sous-titres sont un enrichissement optionnel et ne doivent plus faire échouer une vidéo déjà récupérable. Cela évite notamment qu'un 429 sur les sous-titres bloque tout le corpus.

## Stockage local

Par défaut :

```text
%USERPROFILE%\HibouMedia\competitors\<concurrent>\<job>\...
```

Chaque job terminé produit un résultat local avec chemins, tailles et SHA-256. Les fichiers lourds ne sont pas poussés dans GitHub/Airtable/Vercel.

Les politiques de stockage et de sauvegarde sont suivies séparément : aucune suppression automatique n'est autorisée par le worker.

## Reporting distant

Le reporting est optionnel et séparé de l'exécution.

Endpoint par défaut :

```text
https://d4d5d6.com/api/local-worker-status
```

Il n'est utilisé que si `HIBOU_LOCAL_REPORT_TOKEN` est présent localement. Le serveur doit connaître le même secret. Sans token, le téléchargement continue localement et le reporting est simplement sauté.

Ne jamais stocker ce secret dans GitHub, Airtable, un log ou une capture.

## Observabilité locale

Health loopback uniquement :

```text
http://127.0.0.1:8765/health
```

Le health expose notamment :

- état du worker ;
- opt-in d'exécution ;
- nombre de jobs localement approuvés ;
- jobs traités ;
- jobs en échec et prochain retry ;
- présence du token de reporting, jamais sa valeur.

Logs :

```text
%LOCALAPPDATA%\LeHibou\worker.log
```

État local :

- `processed-jobs.json`
- `failed-jobs.json`
- `approved-jobs.json`

## Diagnostic

Le diagnostic est volontairement non destructif :

```powershell
node .\scripts\hibou-github-worker.mjs --diagnostic
```

Il relève Node, FFmpeg, yt-dlp, Python et NVIDIA/nvidia-smi lorsqu'ils sont présents. Il ne lit pas la queue, ne télécharge rien et n'effectue pas de test réseau externe.

Pour la stack de production vidéo complète, utiliser ensuite le video doctor dédié ; ne déduire ni VRAM libre ni compatibilité CUDA de la seule fiche technique.

## Kill switch

Pour stopper l'exécution locale :

1. arrêter le processus worker ;
2. positionner `HIBOU_LOCAL_EXECUTION_ENABLED=false` ;
3. ne pas ajouter de nouvelle approbation locale.

Une queue distante modifiée ne doit jamais suffire à contourner ces trois actions.

## Sécurité — invariants

- aucun port Internet entrant ;
- queue distante en lecture seule ;
- allowlist d'hôtes ;
- allowlist de types de jobs ;
- opt-in local global ;
- approbation locale exacte ;
- reporting authentifié séparément ;
- aucun secret dans la queue ;
- aucun cookie navigateur lu depuis une commande distante ;
- health uniquement sur `127.0.0.1` ;
- erreurs temporaires isolées pour ne pas transformer une panne d'un job en boucle incontrôlée.

## Suite

La chaîne cible est :

```text
corpus local
→ forensic local
→ manifests mesurés
→ HIBOU_VIDEO_STYLE_PROFILE_V1
→ Asset Graph / Scene Compositor
→ ComfyUI + Chatterbox locaux
→ FFmpeg
→ QC
→ master soumis à validation humaine
```

Le worker ne constitue jamais une autorisation de publication publique.
