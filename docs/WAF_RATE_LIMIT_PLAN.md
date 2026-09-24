# Plan WAF / rate limiting — endpoints publics

Le code applicatif couvre déjà les protections qu'il peut gérer correctement : origins, tailles de body, validation, replay/idempotence et non-énumération.

Le **rate limiting distribué** doit être appliqué au niveau Vercel/WAF/edge ou via un store partagé. Un compteur mémoire dans une fonction serverless donnerait une fausse impression de sécurité et n'est pas retenu.

## Déploiement recommandé

1. commencer en **observation** ;
2. mesurer au moins plusieurs jours de trafic normal ;
3. comparer les pics légitimes avec les seuils initiaux de `config/public-abuse-policy.json` ;
4. activer progressivement les réponses 429 sur les routes publiques non-webhook ;
5. surveiller les faux positifs ;
6. documenter toute exception.

## Points particuliers

### Rétractation
Le droit d'envoyer une demande ne doit pas être entravé par une règle trop agressive. Le seuil initial est volontairement plus généreux.

### Conversion events
Cette route peut être beaucoup plus bavarde qu'un formulaire humain. L'idempotence par `event_id` existe déjà, donc le seuil WAF doit surtout absorber les boucles/anomalies.

### Création de checkout
Cette route mérite une protection plus stricte car elle déclenche un appel externe. Le `request_id` stable et la réutilisation du checkout existant réduisent déjà le risque de replay.

### Webhook Lemon
Ne pas appliquer le même limiteur par IP que pour les visiteurs. La signature HMAC et l'idempotence sont les contrôles principaux.

## Critère de clôture Airtable

- règles WAF/edge visibles et documentées ;
- au moins une période d'observation ;
- test 429 contrôlé sur chaque route publique concernée ;
- aucun blocage des parcours légitimes ;
- webhook fournisseur non perturbé.
