# Social Performance — Le Hibou Rusé

Objectif : mesurer **portée → engagement → clic → achat** au niveau d'une création ET d'une plateforme, sans écraser les métriques d'un réseau par celles d'un autre.

## Stockage

Airtable `Social Performance` contient une ligne stable par `provider:external_id`. Le sync met la ligne à jour : il ne crée pas un snapshot infini à chaque heure.

## V1 automatique

- YouTube : vues, likes, commentaires via YouTube Data API `videos.list(part=statistics)`.
- TikTok : vues, likes, commentaires, partages via Display API `/v2/video/query/` avec scope `video.list`.
- Le workflow `Hibou Social Metrics` appelle `/api/social-metrics` chaque heure.
- Tant que les credentials OAuth ou le déploiement courant ne sont pas disponibles, le workflow ne doit pas bloquer le Core ni la production du livre.

## Sécurité / qualité des données

- une création multi-plateforme conserve une ligne par réseau ;
- aucune métrique non fournie par l'API n'est inventée ;
- `Shares=0` sur YouTube ne signifie pas nécessairement zéro partage réel : le Data API utilisé ici ne fournit pas cette métrique ;
- TikTok nécessite `video.list` en plus des scopes de publication ;
- erreurs 401/403 ou scope manquant passent en `needs_reauth` ;
- credentials absents avant OAuth sont un skip attendu, pas une panne système.

## Extensions prévues

Ajouter Instagram/Facebook, Threads, X et LinkedIn à partir de leurs APIs officielles et permissions réellement accordées. Ensuite joindre ces métriques au funnel de conversion pour calculer ventes / 1 000 vues et revenu / 1 000 vues.