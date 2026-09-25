# Score de proximité qualité Référence ↔ Hibou

Commande :

```
node scripts/video-quality-proximity.mjs style-profile.json hibou-forensic-manifest.json quality-proximity.json
```

Le rapport compare un master Hibou à la distribution du corpus étalon, **sans chercher à copier l’identité d’un concurrent**.

Sous-scores actuellement supportés :
- durée ;
- cuts/minute ;
- durée médiane de scène ;
- ratio de silence ;
- niveau audio moyen ;
- débit de parole si la transcription fournit une mesure ;
- densité textuelle si un module visuel la fournit ;
- mouvement visuel si un module visuel le fournit.

Règles :
- 100 = proche de la médiane de référence ;
- les écarts sont normalisés par l’intervalle interquartile ;
- les métriques absentes sont marquées `not_measured` et **ne pénalisent jamais** le score ;
- le rapport affiche la couverture pour empêcher un score global trompeur ;
- chaque métrique hors bande p25–p75 produit une recommandation directionnelle ;
- aucune publication automatique n’est autorisée.

Le score sert à identifier **quelle brique corriger** : rythme, scènes, silence, volume, débit, texte ou mouvement.
