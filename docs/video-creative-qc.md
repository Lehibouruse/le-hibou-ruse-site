# QC créatif sémantique local V1

Feature flag recommandé : `video_creative_qc_v1` (désactivé par défaut).

Le script `scripts/video-creative-qc.py` ajoute une couche distincte du QC technique. Il utilise CLIP ViT-B/32 par défaut, suffisamment léger pour une RTX 4070 Laptop 8 Go, et ne fait aucun appel d'inférence payant.

Par défaut le chargement Hugging Face est `local_files_only=True`. Le téléchargement open-source d'un modèle n'est possible qu'avec `--allow-model-download`, explicitement.

Scores par scène :
- proximité image ↔ brief ;
- cohérence avec le prompt de direction artistique GLOBAL ;
- présence du Hibou lorsqu'il est attendu ;
- risque d'animal/personnage lorsqu'il est interdit ;
- proximité avec une référence canonique du Hibou ;
- risque sémantique de faux texte / watermark / glyphes parasites.

Chaque rejet conserve les seuils et une liste de raisons. Le résultat porte toujours `human_review_required=true` et `auto_publish_allowed=false`.

Exemple de manifeste :

```json
{
  "canonical_hibou": "assets/hibou-canonical.webp",
  "thresholds": {"semantic_brief_min": 0.53},
  "scenes": [
    {
      "scene_id": "S01",
      "image": "renders/S01.png",
      "brief": "le Hibou pointe un taux qui augmente",
      "expected_hibou": true,
      "style_prompt": "premium editorial flat illustration, ivory, navy, teal, restrained gold"
    }
  ]
}
```
