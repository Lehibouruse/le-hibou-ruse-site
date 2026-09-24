# Chaîne locale de production vidéo — interfaces Airtable V1

Date : 23/09/2026.

## Flux canonique

1. **Airtable Content Pipeline + Scènes vidéo** = état éditorial.
2. `video-airtable-sync.mjs export` = snapshot storyboard versionné.
3. `chatterbox-storyboard-batch.py` = voix par scène + master voix + contrat audio-ready.
4. `video-image-plan.mjs` = exactement trois requêtes IMAGE_GEN déterministes par scène.
5. `video-local-adapters.mjs IMAGE_GEN` = ComfyUI local uniquement.
6. Sélection humaine des images → `selections.json`.
7. `video-storyboard-promote.mjs` = contrat render-ready en copiant audio/images sélectionnés dans le dossier du rendu.
8. `video-local-render.mjs` = master MP4 H.264/AAC 1080×1920@30 fps + manifeste.
9. `video-airtable-sync.mjs report` = remontée état technique, hash, durée et erreurs dans Airtable.
10. Validation humaine séparée avant publication.

## Export Airtable

```bash
AIRTABLE_TOKEN=... node scripts/video-airtable-sync.mjs export recCONTENT ./work/obo/storyboard.json
```

Le token reste uniquement dans l'environnement local. L'export refuse :
- moins de 15 ou plus de 25 scènes ;
- ordre non contigu ;
- durée hors 1,5–2,5 s ;
- narration qui ne reconstitue pas exactement le Script après normalisation des espaces.

## Plan image

Le binding ComfyUI est volontairement séparé du storyboard : il contient les vrais IDs de nœuds du workflow exporté.

Exemple de structure **à remplacer par les IDs réels du workflow local** :

```json
{
  "endpoint": "http://127.0.0.1:8188",
  "workflow_path": "/chemin/local/workflow-api.json",
  "prompt": {"node_id": "ID_REEL", "input": "INPUT_REEL"},
  "seed": {"node_id": "ID_REEL", "input": "INPUT_REEL"},
  "output_node_ids": ["ID_REEL"],
  "style_prefix": "charte visuelle Hibou",
  "style_suffix": "",
  "timeout_seconds": 600,
  "max_retries": 1
}
```

Puis :

```bash
node scripts/video-image-plan.mjs storyboard.json comfyui-binding.json image-plan.json
```

Le plan crée trois seeds déterministes distincts par scène. Aucun service cloud ou fallback payant n'est ajouté.

## Remontée Airtable

Après rendu :

```bash
AIRTABLE_TOKEN=... node scripts/video-airtable-sync.mjs report recCONTENT master.mp4.manifest.json
```

Un test sans écriture est possible avec `--dry-run`.

La remontée marque explicitement les références locales comme **non durables**. Elle ne convertit jamais un chemin local en faux URL durable et ne crée pas d'attachment Airtable fictif.

En cas d'échec local :

```bash
AIRTABLE_TOKEN=... node scripts/video-airtable-sync.mjs report-error recCONTENT "message"
```

## Règle de reprise

Le contrat exporté est le snapshot d'entrée. Les IDs Airtable des scènes restent dans le contrat. Les générations utilisent des IDs stables et des manifestes. Un rerun ne doit donc pas recréer une scène déjà exploitable si ses entrées sont identiques.
