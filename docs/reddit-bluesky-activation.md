# Activation Reddit et Bluesky — 22 septembre 2026

## État réel

- Bluesky : les variables Production existent. Le dernier test distant du 21 septembre a répondu HTTP 401, identifiant ou mot de passe invalide. La connexion n'est pas validée.
- Reddit : dossier préparé, pas d'accord ni de Client ID/Secret connus. Aucun appel à Reddit effectué avec ce connecteur. Les tests automatisés utilisent des réponses simulées.
- Aucun post de test public n'a été publié. Aucun abonnement ni contrat API payant n'a été accepté.

## Bluesky : une saisie, puis opérations techniques prises en charge

1. Dans Bluesky, Paramètres → Confidentialité et sécurité → Mots de passe d'application, créer un mot de passe si la valeur complète n'est plus disponible.
2. Coller la valeur complète directement dans `BLUESKY_APP_PASSWORD`, environnement Production du projet Vercel `le-hibou-ruse-site`, puis Save. Ne pas ajouter de fragments ni envoyer la clé dans le chat.
3. L'agent vérifie `BLUESKY_IDENTIFIER=le-hibou-ruse.bsky.social`, redéploie Production et attend Ready/Current.
4. L'agent relance le job isolé `bluesky_connection` (run 35595596331, job initial 106319528247). Vérifier une seule réponse Bluesky réussie et l'identité exacte attendue. Ce test ne publie rien.
5. Si le test échoue encore, vérifier identifiant et validité du mot de passe sans révéler sa valeur. Ne pas marquer le réseau connecté.

Les identifiants et URL des futures publications peuvent maintenant être conservés dans Content Pipeline (`ID Bluesky`, `URL Bluesky`). Les compteurs publics likes, réponses, republications et citations peuvent être lus ; les vues non exposées restent indisponibles.

## Reddit : dossier de demande prêt à utiliser

Formulaire officiel : https://support.reddithelp.com/hc/en-us/requests/new?tf_42139884615700=api_request_type_enterprise_clone&ticket_form_id=14868593862164

Le navigateur distant est actuellement arrêté par la vérification de sécurité du formulaire. Aucun formulaire n'a été envoyé. Les seules informations de contact encore à confirmer sont le pseudo Reddit du Hibou et l'adresse de réponse souhaitée. Le champ société est facultatif : ne pas inventer d'entité juridique ; `N/A` convient si la demande est présentée à titre individuel, selon le formulaire.

### Subject

Commercial Reddit API access request — Le Hibou Rusé editorial account

### Description

I am requesting permission to use the Reddit Data API for Le Hibou Rusé, a French-language editorial project about taxation and business structures, available at https://d4d5d6.com. The project has a commercial purpose: it intends to sell its own educational publications and services.

The proposed integration would connect only the Reddit account controlled by the project owner. It would verify that account, prepare and publish original text or link posts to selected communities where this content is permitted, and retrieve public metadata for the project's own posts (such as comment counts and score). During launch, live publications require human review. The integration will not send private messages, vote, mass-comment, or collect private user information. It does not require bulk Reddit datasets or Reddit content for AI model training.

This is an integration in an existing external editorial dashboard, rather than an application running inside a subreddit. The planned implementation uses the official OAuth web application flow, the identity/read/submit scopes and permanent authorization to refresh tokens. Tokens are encrypted at rest; secrets are not included in public pages or logs. Automated tests are currently offline and the Reddit connector remains disabled pending your approval. No Reddit API access has been activated for this project.

Please confirm whether this use case is eligible and the applicable access process, conditions and any pricing. No paid commitment is being made by this request. We will limit the implementation to the permissions and use you approve.

### Technical values ready for app setup after approval

- App name: Le Hibou Rusé
- Website: https://d4d5d6.com
- App type: Web app
- Redirect URI: https://d4d5d6.com/api/social/oauth/reddit/callback
- Requested scopes: `identity read submit` (adjust to Reddit's actual approval)
- User-Agent: `web:le-hibou-ruse:v1.0 (by /u/CONFIRMED_USERNAME)` — replace only after confirming the account
- Server secrets: `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`
- Server configuration: `REDDIT_USER_AGENT`, `REDDIT_EXPECTED_USERNAME`; set `REDDIT_API_APPROVED=true` only after receiving and recording Reddit's approval
- Optional publication target: `REDDIT_SUBREDDIT`; leave unset until a suitable community has been chosen and its rules checked
- OAuth launch: `/api/social/oauth/reddit/start`, through the existing authenticated administration
- Read test: authenticated POST `/api/social/connection-test` with `{"provider":"reddit"}`

The agent handles application configuration, encrypted token storage, refresh, read tests and diagnostic updates after the required account authorization. The connection callback triggers an identity test. The gateway supports text/link payloads; it does not imply support for native Reddit video uploads or automatic multi-network fan-out. Live publication and its visibility must be reviewed separately. Required community flair or other community-specific rules may need additional configuration.

`ID Reddit` / `URL Reddit` in Content Pipeline retain successful publication references. The score is retained separately from likes; unsupported views and similar metrics are recorded as unavailable rather than invented.

## Sources

- https://support.reddithelp.com/hc/en-us/articles/14945211791892-Developer-Platform-Accessing-Reddit-Data
- https://github.com/reddit-archive/reddit/wiki/OAuth2
- https://www.reddit.com/dev/api/
- https://github.com/bluesky-social/atproto/blob/main/lexicons/app/bsky/feed/getPosts.json

The OAuth wiki describes the protocol; the current Reddit help pages govern access eligibility. Offline validation does not establish that Reddit will approve the project or that live API calls will succeed.
