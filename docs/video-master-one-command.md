# Orchestrateur vidéo one-command

Le pipeline Hibou peut maintenant produire un **master technique complet** en une seule commande, tout en restant fail-closed pour la publication.

## Depuis un storyboard local

```
npm run video:master -- --storyboard=C:\...\storyboard.json --binding=C:\...\hibou-binding.json --output=C:\HibouMedia\runs\obo
```

## Depuis un contenu Airtable

```
npm run video:master -- --content=recXXXXXXXX --binding=C:\...\hibou-binding.json --output=C:\HibouMedia\runs\obo
```

Par défaut, le rapport Airtable final est un **dry-run**. Pour l'appliquer explicitement :

```
npm run video:master -- --content=recXXXXXXXX --binding=C:\...\hibou-binding.json --output=C:\HibouMedia\runs\obo --report-airtable
```

## Chaîne exécutée

1. export/validation du storyboard ;
2. Chatterbox local avec cache par scène ;
3. mastering audio ;
4. sous-titres ASS ;
5. application facultative de `HIBOU_VIDEO_STYLE_PROFILE_V1` ;
6. usine image : 3 candidats/scène, QC, fallback OOM local, régénération ciblée ;
7. sélection technique automatique du meilleur candidat QC ;
8. promotion render-ready ;
9. rendu FFmpeg ;
10. QC master ;
11. registre SHA-256 ;
12. reporting Airtable dry-run ou explicite.

## Reprise après interruption

`pipeline-run.json` mémorise chaque étape PASS/ERROR. Une relance dans le même dossier saute les étapes PASS. Si storyboard, binding ou profil de style changent, le pipeline refuse de réutiliser le dossier : utiliser un nouveau répertoire pour éviter les artefacts obsolètes.

## Garde-fous

- maximum 25 scènes ;
- maximum 2 régénérations ciblées ;
- aucun fallback cloud/payant ;
- aucun upload/publication ;
- la sélection image automatique est seulement technique ;
- le master final requiert toujours une validation humaine ;
- `publication_authorized=false` reste écrit dans l'état et le résultat.
