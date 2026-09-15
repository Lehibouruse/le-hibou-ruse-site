# HIBOU social control plane

## Objectif

Le Hibou doit piloter les réseaux depuis un seul plan de contrôle sans exposer les secrets au modèle.

Chemin nominal :

`Airtable Jobs / Content Pipeline -> HIBOU social scheduler -> social gateway -> API officielle du réseau`

Chemin d'autorisation :

`app développeur -> variables serveur Vercel -> /admin/social/control-plane -> consentement humain OAuth -> coffre chiffré Social Credentials -> API officielle`

Chemin de secours :

`social gateway -> webhook HTTPS Pipedream/équivalent -> réseau`

Le direct officiel reste toujours prioritaire. Le webhook de secours n'est utilisé que dans les cas explicitement considérés comme sûrs par `lib/social-fallback.mjs` afin d'éviter les doubles publications.

## Frontière humaine

Le code peut préparer les callbacks, les scopes, le chiffrement, le stockage des tokens, le routage, l'audit des droits, la synchronisation Airtable et les dry-runs. La dernière étape interactive reste le consentement OAuth du propriétaire du compte et, lorsque le fournisseur l'impose, l'approbation/review de l'application.

Le control plane expose la phase `HUMAN_OAUTH_APPROVAL_REQUIRED` uniquement lorsque la préparation serveur est suffisante. Le bouton `Valider l’autorisation` ouvre alors le flux OAuth officiel du réseau. Il ne déclenche aucune publication.

## Airtable

La table `Comptes sociaux` est le registre non secret. Elle contient notamment :

- l'état direct et la phase d'autorisation ;
- le callback OAuth exact ;
- le portail développeur ;
- les noms des variables serveur requises, jamais leurs valeurs ;
- le lien interne de validation OAuth ;
- les indicateurs `OAuth Hibou connecté`, `Prêt validation humaine`, `Fallback webhook prêt` ;
- l'action humaine restante.

`POST /api/social/control-plane` avec `{ "action": "sync_airtable" }` ou le bouton de synchronisation dans `/admin/social/control-plane` recalcule et pousse cet état dans Airtable.

## Secrets

Ne jamais stocker dans Airtable, GitHub, un prompt, un Job ou un journal :

- client secret ;
- access token ;
- refresh token ;
- mot de passe ;
- clé maître du coffre ;
- secret de webhook.

Les client secrets restent dans les variables serveur. Les tokens obtenus après OAuth sont chiffrés AES-256-GCM dans `Social Credentials`. Le control plane ne retourne que des noms de variables, booléens de présence, scopes et métadonnées non secrètes.

## Fallback Pipedream

Un workflow de secours peut être branché réseau par réseau avec :

- `HIBOU_SOCIAL_YOUTUBE_WEBHOOK_URL`
- `HIBOU_SOCIAL_INSTAGRAM_WEBHOOK_URL`
- `HIBOU_SOCIAL_FACEBOOK_WEBHOOK_URL`
- `HIBOU_SOCIAL_TIKTOK_WEBHOOK_URL`
- `HIBOU_SOCIAL_LINKEDIN_WEBHOOK_URL`
- `HIBOU_SOCIAL_PINTEREST_WEBHOOK_URL`
- `HIBOU_SOCIAL_X_WEBHOOK_URL`
- `HIBOU_SOCIAL_THREADS_WEBHOOK_URL`
- `HIBOU_SOCIAL_SNAPCHAT_WEBHOOK_URL`

Le secret facultatif commun est `HIBOU_SOCIAL_WEBHOOK_SECRET`. Le gateway l'envoie en `Authorization: Bearer ...`.

Le webhook reçoit un JSON contenant notamment `provider`, `source: HIBOU_AGENT_V1`, `fallback_from: direct`, ainsi que le payload de publication. Il doit répondre en HTTP 2xx avec un JSON exploitable et ne doit pas republier un idempotency key déjà traité.

## Garde-fous

- `social_test_mode=TRUE` reste le mode par défaut pendant l'intégration.
- aucune publication publique de test sans validation humaine explicite ;
- X ne doit jamais entraîner automatiquement l'achat de crédits ou l'activation d'un plan payant ;
- Snapchat reste bloqué tant que Snap n'accorde pas réellement l'accès produit/API requis ;
- un compte n'est pas déclaré `CONNECTED_AND_TESTED` sur la seule base d'un token : lecture réelle, test de publication non public/sandbox et analytics sont suivis séparément.
