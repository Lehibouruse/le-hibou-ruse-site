# Social Performance — Le Hibou Rusé

Objectif : mesurer **portée → engagement → clic → achat** au niveau d'une création ET d'une plateforme, sans écraser les métriques d'un réseau par celles d'un autre.

## Stockage

Airtable `Social Performance` contient une ligne stable par `provider:external_id`. Le sync met la ligne à jour : il ne crée pas un snapshot infini à chaque heure.

Le schéma canonique conserve les compteurs comparables entre réseaux : vues, likes, commentaires, partages, sauvegardes, watch time, complétion, clics et abonnés générés. Il conserve aussi les compléments utiles désormais disponibles :

- `Reach` ;
- `Total Interactions` ;
- `Average View Duration Seconds` ;
- `Analytics Status` ;
- `Metrics Details JSON`, limité à une allowlist de métadonnées provider-spécifiques non secrètes (fenêtre analytics, métriques disponibles, type de média, etc.).

## Collecte automatique actuelle

- YouTube : compteurs publics + YouTube Analytics quand les droits sont disponibles : watch time, durée moyenne, pourcentage moyen vu, abonnés gagnés, partages et fenêtre de mesure.
- TikTok : vues, likes, commentaires et partages via les APIs officielles avec `video.list`.
- Instagram : likes/commentaires + insights média récupérés métrique par métrique afin qu'une métrique indisponible ne fasse pas échouer tout le relevé ; vues/plays, reach, saves, shares et interactions selon le type de média et les droits accordés.
- Facebook : réactions, commentaires, partages et insights Page/post disponibles.
- LinkedIn : analytics de l'organisation/Page lorsque `LINKEDIN_ORGANIZATION_URN` est configuré, avec fallback profil membre si nécessaire.
- Pinterest : impressions, sauvegardes, clics Pin et clics sortants sur la fenêtre supportée par l'API.
- Threads et X : métriques supportées par les adaptateurs officiels existants lorsque leurs credentials/droits sont disponibles.

Le workflow `Hibou Social Metrics` appelle `/api/social-metrics` périodiquement. Les credentials OAuth absents ou non encore approuvés ne doivent pas bloquer le Core ni la production éditoriale.

## Sécurité / qualité des données

- une création multi-plateforme conserve une ligne par réseau ;
- aucune métrique non fournie par l'API n'est inventée ;
- les propriétés provider-spécifiques persistées dans `Metrics Details JSON` passent par une allowlist ; aucun token, secret ou payload OAuth arbitraire n'y est sérialisé ;
- erreurs 401/403 ou scope manquant passent en `needs_reauth` ;
- credentials absents avant OAuth sont un état `unavailable` attendu, pas une panne système ;
- **un refresh qui échoue ne remet jamais les derniers compteurs valides à zéro** : seuls l'état opérationnel, l'horodatage de tentative et l'erreur sont mis à jour ;
- les nouveaux compteurs ne sont enregistrés qu'après une lecture API réussie.

## Exploitation

`Social Performance` sert de source au calcul de l'efficacité des contenus et du funnel d'acquisition. Une fois les données réelles disponibles, elles peuvent être rapprochées des événements de conversion et des ventes pour calculer notamment ventes / 1 000 vues, revenu / 1 000 vues, taux de clic et efficacité par réseau, format et création.
