# Le Hibou Rusé — état de reprise canonique

Dernière mise à jour : 03/10/2026.

## Sources de vérité

Toujours distinguer le code présent dans `main`, la configuration réellement active, une preuve d'exécution réussie et l'autorisation de publier. Une CI verte ou un artefact historique ne remplace aucune de ces preuves.

- Code du site et du pipeline : dépôt `Lehibouruse/le-hibou-ruse-site`, branche `main`.
- Données éditoriales et états opérationnels : base Airtable `D4-D5-D6 — Média fiscal`.
- Production web : projet Vercel `le-hibou-ruse-site`, domaine canonique `d4d5d6.com`.
- Vidéo : Video Studio V5 local, piloté exclusivement par `HIBOU_VIDEO_RENDER_QUEUE_V2`.

Le dépôt vide `Lehibouruse/Site-du-Hibou-Rus-`, les branches fermées, les previews passées et les documents de branche marqués comme archives ne sont pas des sources de vérité.

## Vidéo canonique V5

Le chemin V2 de l'ancien agent est désactivé et ne reçoit plus aucun outil de génération ou de rendu. Toute production vidéo doit :

1. partir des enregistrements Airtable courants ;
2. embarquer un reçu `HIBOU_AIRTABLE_SOURCE_SNAPSHOT_V1` ;
3. entrer par la file `HIBOU_VIDEO_RENDER_QUEUE_V2` ;
4. être exécutée localement par le pipeline V5, avec ses gates runtime ;
5. conserver la publication verrouillée ;
6. obtenir le verdict final `PROMPT_CONTRACT_PASS` et la revue humaine requise.

Les anciens scripts V2/V3, pilotes, rendus, prompts et scènes techniques non reliées ne doivent jamais être utilisés pour lancer une production.

### Box Spread

La seule fiche éditoriale de référence est `Lombard vs Box Spread — marge bancaire`, Script V4, état `CANONICAL — SCRIPT V4 — CLEAN`, avec les 15 scènes `box_spread_s01` à `box_spread_s15`. Les anciens POC et paramètres dérivés ne font pas autorité.

## État web et infrastructure

- Le domaine `https://d4d5d6.com` répond et `/api/site-identity` confirme l'identité canonique.
- Vercel ne doit déployer automatiquement que `main` ; toutes les autres branches sont désactivées par défaut.
- Les routes qui ont besoin de la configuration complète doivent utiliser la pagination Airtable. La table Configuration dépasse 100 lignes et les Jobs dépassent 100 lignes.
- Les secrets restent dans leurs magasins dédiés. Aucun audit ou nettoyage ne doit lire, recopier ou supprimer une valeur secrète sans preuve d'usage et décision explicite.

## Garde-fous

- aucun secret dans Git, Airtable ordinaire ou la documentation ;
- aucun fallback payant silencieux ;
- aucun worker démarré implicitement ;
- aucune publication automatique non validée ;
- aucune suppression ambiguë : archiver ou conserver ;
- aucune ancienne version ne doit concurrencer une source canonique actuelle.

## Preuves encore distinctes

- Un pipeline présent dans le code n'est pas un rendu V5 réussi sur la machine locale.
- Un profil Airtable actif n'est pas une autorisation de publication.
- Une variable Vercel présente n'est pas une preuve que l'intégration externe fonctionne.
- Une branche fusionnée ou une preview historique n'est pas une branche active.

## Documents

- Index documentaire : `docs/README.md`.
- Activation V5 opt-in : `docs/video-studio-v5-activation.md`.
- Méthodologie V5 : `docs/video-methodology-roadmap-v5.md`.
- Les documents de statut liés à une branche doivent être lus comme des archives datées lorsqu'ils l'indiquent.
