# Usine image locale Hibou

Commande unique pour le chemin image local :

```
node scripts/video-image-factory.mjs storyboard.json comfyui-binding.json C:\HibouMedia\runs\obo-images --max-scenes=1 --regen-attempts=1
```

Par défaut, elle ne traite qu'une scène :
1. 3 candidats déterministes ;
2. manifeste persistant/cache ;
3. fallback OOM local déjà prévu par le binding ;
4. QC technique ;
5. QC perceptuel OpenCV/pHash ;
6. si aucun candidat PASS, régénération de cette scène seulement ;
7. sélection provisoire QC, toujours soumise à revue humaine.

Pour le QC perceptuel, définir `HIBOU_QC_PYTHON` vers un Python local disposant de `opencv-python-headless` et `numpy`. Aucun téléchargement de modèle n'est déclenché par la commande.

Garde-fous :
- maximum 20 scènes par invocation ;
- maximum 2 tentatives de régénération ciblée ;
- aucun fallback cloud/payant ;
- aucune publication ;
- les scènes déjà PASS ne sont pas régénérées.
