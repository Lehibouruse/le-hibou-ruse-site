# Premier run GPU local — Le Hibou Rusé

Version : 23/09/2026.

Objectif : tester **un seul composant lourd à la fois**, sur une machine locale réellement accessible, sans ouvrir de service sur Internet et sans basculer vers un fournisseur payant.

## 1. Préflight obligatoire

Depuis la racine du dépôt :

```bash
node scripts/video-local-preflight.mjs
```

Le script est purement local : il ne fait aucun appel réseau et ne télécharge rien. Il relève CPU/RAM/disque, `nvidia-smi`, Python, FFmpeg et FFprobe.

Pour un check bloquant :

```bash
node scripts/video-local-preflight.mjs --require-gpu
```

Si la décision vaut `STOP_BEFORE_MODEL_DOWNLOAD`, **ne télécharger aucun modèle**. Corriger d’abord le matériel/runtime manquant.

Ne jamais déduire qu’un GPU convient à un modèle uniquement parce que `nvidia-smi` répond : comparer ensuite la VRAM réellement libre aux exigences du workflow/checkpoint choisi.

## 2. Ordre de test

L’ordre recommandé est :

1. **VOICE_GEN_V1 / Chatterbox Multilingual** sur une seule unité de souffle française de 1–2 phrases ;
2. écoute humaine du WAV, mesure de durée et intelligibilité ;
3. seulement si la voix vaut la peine : test **IMAGE_GEN_V1 / ComfyUI + FLUX.1-schnell** sur une seule scène ;
4. seulement si l’image vaut la peine : génération des 3 candidats d’une scène puis QC ;
5. seulement après ces deux preuves : pilote complet OBO ou donation-cession.

Motif : télécharger et valider plusieurs modèles avant d’avoir prouvé la première brique gaspille disque, temps et bande passante.

## 3. Chatterbox — smoke test

Créer une requête conforme à `VOICE_GEN_V1` avec :
- `language_id: "fr"` ;
- une unité de souffle <= 300 caractères ;
- un `audio_prompt_path` seulement si la référence vocale est autorisée ;
- `device: "cuda"` uniquement si CUDA est réellement disponible ;
- seed fixé pour la reproductibilité.

Exécuter :

```bash
node scripts/video-local-adapters.mjs VOICE_GEN request-voice.json
```

Le wrapper échoue si CUDA est demandé mais absent ; il ne bascule pas vers un service payant.

Contrôles avant de continuer :
- WAV présent et lisible ;
- texte prononcé sans omission ;
- durée compatible avec le plan ;
- pas de voix caricaturale/radio ;
- aucun secret ou donnée personnelle dans le manifeste.

Les paramètres `target_wpm`, `pause_after_ms`, `intent` et `emphasis` restent des métadonnées Hibou. Ils ne doivent pas être présentés comme des réglages natifs Chatterbox.

## 4. ComfyUI + FLUX.1-schnell — smoke test

ComfyUI doit rester joignable uniquement en loopback, par exemple `http://127.0.0.1:8188`.

Exporter le workflow ComfyUI au format API et préparer une requête `IMAGE_GEN_V1`.

L’adaptateur :
- refuse un endpoint non local ;
- n’override que les inputs réellement présents dans le workflow ;
- fixe un identifiant de travail déterministe ;
- limite les retries à 0–2 ;
- réutilise un manifeste valide au lieu de régénérer inutilement ;
- n’implémente aucun fallback payant.

Première exécution : **une scène seulement**. Ne lancer les 3 candidats puis les 15–25 scènes qu’après inspection de la première sortie.

## 5. Règle de stockage

Par défaut, les sorties vont sous :

```
.hibou-video-artifacts/<content>/<scene>/<type>/<job-id>/
```

Ce dossier et les caches FFmpeg sont ignorés par Git.

Les gros modèles et médias ne vont jamais dans :
- le dépôt GitHub ;
- Vercel ;
- les variables d’environnement ;
- Airtable en pièce jointe si leur taille/volume devient significatif.

Après validation d’un master, conserver seulement les artefacts utiles dans la Library du projet avec manifeste/hashes.

## 6. Sécurité, licences et coûts

- Aucun secret dans JSON, Git, Airtable ou captures.
- Aucun endpoint ComfyUI public.
- Aucun téléchargement massif avant le préflight.
- FLUX.1-schnell : checkpoint retenu sous Apache-2.0 au 22/09/2026 ; revérifier la fiche exacte si le checkpoint change.
- Chatterbox : MIT pour le dépôt/modèle retenu ; conserver la provenance et la référence vocale autorisée.
- Ne pas substituer automatiquement LTX-2 : les poids ont leur propre licence communautaire.
- FFmpeg local courant : build GPL/libx264 ; documenter avant toute redistribution binaire.
- Aucun plan Cloudflare Paid, GPU cloud ou API payante sans accord explicite.

## 7. Critères de passage au pilote

Passer à OBO/donation-cession seulement si :
- préflight vert ;
- 1 WAV Chatterbox validé humainement ;
- 1 image FLUX validée humainement ;
- temps de génération mesuré ;
- aucune correction critique de conformité/licence ;
- aucune dépense engagée.

Le statut Airtable doit refléter la réalité : `Prompt prêt` n’est pas `Image validée`, et `PREPRODUCTION_READY` n’est pas un master produit.
