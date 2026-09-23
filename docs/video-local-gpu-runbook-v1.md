# Runbook GPU local — vidéo Hibou V1

Date : 23/09/2026.

Objectif : tester d'abord **une seule scène** FLUX.1-schnell puis **une seule unité de souffle** Chatterbox Multilingual. Aucun modèle lourd ne doit être téléchargé avant le préflight.

## 1. Préflight

```bash
node scripts/video-local-preflight.mjs
node scripts/video-local-preflight.mjs --require-ready
```

Le second appel échoue volontairement si :
- aucun GPU NVIDIA n'est visible ;
- Python 3.11 n'est pas disponible ;
- FFmpeg/ffprobe manquent ;
- le stockage libre est inférieur au garde-fou projet.

Le plancher de 25 GiB est configurable via `HIBOU_MIN_FREE_GIB`. C'est un garde-fou du projet, pas une exigence officielle attribuée aux modèles.

## 2. Chatterbox Multilingual en premier

L'implémentation officielle Resemble AI documente le français, un texte limité à 300 caractères dans son interface de démonstration, une référence audio facultative, `exaggeration`, `temperature`, seed et `cfg_weight`.

Le dépôt officiel indique un environnement testé en Python 3.11. Créer donc un environnement Python 3.11 isolé plutôt que d'utiliser aveuglément un Python système différent.

Premier essai :
1. une seule unité de souffle OBO ou donation-cession ;
2. référence vocale autorisée/non identifiable ;
3. `language_id=fr` ;
4. paramètres proches des valeurs neutres ;
5. WAV + manifeste + hash conservés ;
6. écoute des liaisons, chiffres, sigles et termes fiscaux ;
7. durée réelle mesurée avant tout post-traitement.

Commande Hibou après installation :

```bash
node scripts/video-local-adapters.mjs VOICE_GEN request-voice.json
```

Les WPM, pauses et intentions Airtable restent des métadonnées de production. Elles ne sont pas présentées comme des paramètres natifs Chatterbox.

## 3. ComfyUI + FLUX.1-schnell ensuite

Installer ComfyUI seulement après le préflight. Exporter un workflow au format API et relever les **vrais IDs de nœuds et noms d'inputs**.

Premier test image :
- une scène seulement ;
- trois candidats ;
- même prompt ;
- seeds distincts et enregistrés ;
- aucun second gros modèle ;
- aucun endpoint public.

Commande :

```bash
node scripts/video-local-adapters.mjs IMAGE_GEN request-image.json
```

Le connecteur Hibou refuse les endpoints non-loopback.

## 4. Montée en charge

1. 1 unité de souffle Chatterbox.
2. 1 scène FLUX × 3 candidats.
3. 3 scènes du même pilote.
4. Pilote complet seulement si les étapes 1–3 sont exploitables.
5. Deuxième pilote après mesure du temps, des corrections et du stockage.

Pendant ce test, ne pas ajouter LTX-2, Kokoro ou une solution cloud.

## 5. Preuve minimale

Conserver :
- rapport `HIBOU_LOCAL_PREFLIGHT_V1` ;
- versions logiciels/paquets ;
- checkpoint exact et licence ;
- requête JSON ;
- seed ;
- fichier + SHA-256 ;
- durée de génération ;
- durée média ;
- erreurs/retries ;
- décision QC ;
- coût additionnel réel ;
- temps humain actif.

## 6. Sécurité

- aucun port ComfyUI/Chatterbox exposé sur Internet ;
- aucun tunnel ;
- aucun secret dans Git/Airtable/manifestes ;
- aucun fallback payant ;
- modèles, médias et caches hors Git/Vercel.

Références officielles vérifiées le 23/09/2026 : documentation ComfyUI et dépôt Resemble AI Chatterbox Multilingual.
