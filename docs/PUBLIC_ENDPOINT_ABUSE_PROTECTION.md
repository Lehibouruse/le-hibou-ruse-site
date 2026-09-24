# Protection anti-abus des endpoints publics

État : plan de déploiement, aucune règle Vercel activée par ce document.

## Pourquoi protéger au niveau Vercel

Le projet tourne sur une architecture serverless. Un compteur stocké en mémoire dans une Function ne constitue pas un rate limit distribué fiable : plusieurs instances/régions peuvent avoir des états différents.

Le contrôle de volume doit donc être placé en amont, au niveau Vercel Firewall/WAF, puis complété par les garde-fous applicatifs déjà présents.

Références Vercel vérifiées le 24/09/2026 :
- https://vercel.com/changelog/create-vercel-waf-custom-rules-using-natural-language
- https://vercel.com/changelog/vercel-waf-rate-limiting-now-generally-available
- https://vercel.com/pricing
- https://vercel.com/academy/optimize-your-vercel-account/firewall-rules

## Garde-fous applicatifs déjà présents

- allowlist Origin sur les formulaires navigateur concernés ;
- limites de taille de body ;
- validation des types/champs ;
- honeypot sur certains formulaires ;
- déduplication des conversion events ;
- HMAC sur le webhook Lemon ;
- identifiants UUID et réponses non énumérantes sur l’accès commande.

Ces contrôles restent nécessaires même avec le Firewall.

## Endpoints publics prioritaires

### Groupe A — écritures issues du navigateur

- `POST /api/leads`
- `POST /api/conversion-event`
- `POST /api/retractation`
- `POST /api/commerce/digital-supply-consent`

Risque principal : spam, consommation Airtable/Functions, création répétée de checkouts Test/Live lorsque le parcours est activé.

### Groupe B — lecture publique à coût serveur

- `GET /api/commerce/access`

Risque principal : polling excessif / charge Airtable. L’UUID limite déjà l’énumération logique.

### À ne pas mélanger aveuglément avec le groupe navigateur

- `POST /api/commerce/lemon-webhook`

Le webhook est signé par Lemon. Ne pas lui appliquer un challenge navigateur. Si un contrôle de volume est ajouté ultérieurement, il doit être compatible avec le trafic provider et testé avec le mode TEST.

## Déploiement recommandé

### Phase 1 — observer

Créer une règle custom Vercel **Log** ciblant :
- méthode POST ;
- chemins exacts du Groupe A.

Laisser tourner suffisamment longtemps pour observer le trafic légitime avant de choisir le seuil.

Activer Bot Protection d’abord en mode Log si le dashboard/plan le permet, sans Challenge automatique sur les webhooks/provider callbacks.

### Phase 2 — rate limit

Après observation, convertir ou compléter avec une règle Rate Limit identifiée par IP.

Point de départ de test, à ajuster avec les logs :
- Groupe A : environ 30 requêtes / 60 secondes / IP ;
- réponse : HTTP 429 ;
- persistance courte seulement si Vercel la propose.

Ce seuil est volontairement généreux pour un humain et vise surtout le spam automatisé. Les IP partagées/NAT imposent de surveiller les faux positifs.

Si le plan n’autorise qu’une règle de rate limiting, grouper uniquement des endpoints aux besoins suffisamment proches. Ne pas forcer le webhook Lemon dans le même seuil.

### Phase 3 — raffiner

À partir des logs :
- réduire la limite de `/api/leads` et `/api/retractation` si nécessaire ;
- traiter `/api/conversion-event` séparément si son volume normal est plus élevé ;
- ajouter une protection spécifique à `GET /api/commerce/access` seulement si le polling devient significatif ;
- envisager JA4 / User-Agent / Bot Protection en complément de l’IP si les abus tournent les IP.

## Tests avant enforcement

1. formulaire contact normal ;
2. conversion event normal ;
3. demande de rétractation ;
4. consentement Lemon TEST ;
5. rafale contrôlée sur un endpoint non commercial ;
6. vérifier apparition des événements Firewall ;
7. vérifier qu’un dépassement donne le comportement prévu ;
8. vérifier que Lemon webhook TEST reste intact ;
9. rollback immédiat si faux positifs.

## Règles à ne pas appliquer

- pas de rate limiter en mémoire dans une Function comme contrôle principal ;
- pas de Challenge navigateur sur un webhook provider ;
- pas de blocage géographique général sans besoin métier ;
- pas d’enforcement avant une phase Log ;
- pas de modification LIVE Lemon pour tester un garde-fou.

## État de preuve

Ce document est un plan. La protection n’est considérée active qu’après vérification dans Vercel Firewall et test runtime contrôlé.
