# QC visuel local + régénération ciblée

Le pipeline applique trois niveaux :
1. `video-image-qc.mjs` : décodage, dimensions, ratio vertical, doublons exacts ;
2. `video-image-perceptual-qc.py` : exposition, clipping, netteté Laplacian, saturation, pHash et quasi-doublons ;
3. DINOv2 optionnel, uniquement si les poids/licences retenus sont validés et déjà disponibles localement.

Aucun modèle externe n'est téléchargé par le QC perceptuel de base.

## Exécution

```
node scripts/video-image-qc.mjs batch-manifest.json image-tech-qc.json
python scripts/video-image-perceptual-qc.py image-tech-qc.json image-perceptual-qc.json
node scripts/video-image-regenerate.mjs image-plan.json image-perceptual-qc.json regen-plan.json --attempt=1
```

Le plan de régénération ne contient que les scènes sans candidat PASS. Les scènes validées ne sont pas générées une seconde fois. Les seeds sont dérivés de manière déterministe par tentative.

Les seuils perceptuels sont des garde-fous techniques, pas une validation esthétique finale. Avant un pilote complet, une revue humaine reste obligatoire.
