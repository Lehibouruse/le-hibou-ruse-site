# Timeline intra-scène V1

Extension optionnelle du contrat vidéo existant. Elle ne modifie pas `HIBOU_VIDEO_CONTRACT_V1` et n'altère aucun rendu si `scene.timeline` est absent.

## Format

```json
{
  "schema": "HIBOU_SCENE_TIMELINE_V1",
  "events": [
    {"type":"text","start_s":0,"end_s":3,"text":"TAUX DE MARCHÉ"},
    {"type":"callout","start_s":3,"end_s":5,"text":"+1 %"},
    {"type":"callout","start_s":5,"end_s":7,"text":"+1,5 %"},
    {"type":"text","start_s":7,"end_s":9,"text":"CHAQUE ANNÉE"}
  ]
}
```

Types pris en charge : `text`, `callout`, `object`, `pose`, `camera`, `accent`. Les événements de texte et d'asset utilisent les expressions FFmpeg `enable=between(t,...)`. Les événements caméra sont compilés dans l'expression `zoompan` par fenêtres d'images. Aucun changement complet de background n'est requis.

Le flag d'activation recommandé au niveau orchestration est `video_timeline_v1`. Le compositor lui-même reste backward-compatible : absence de timeline = comportement V1 historique.

### Mouvement léger et accent

Un événement `object` ou `pose` peut définir `move_to_offset_x` / `move_to_offset_y`. FFmpeg interpole alors la position pendant la fenêtre temporelle sans remplacer le background.

Un événement `accent` produit par défaut une bordure or temporaire en post-production (`drawbox`), configurable via `color`, `thickness` et `margin`.
