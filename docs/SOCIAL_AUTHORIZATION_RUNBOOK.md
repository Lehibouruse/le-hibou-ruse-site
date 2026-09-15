# Le Hibou Rusé — runbook d'autorisation des réseaux

Objectif : pousser automatiquement chaque réseau jusqu'au dernier point techniquement possible sans consentement du propriétaire du compte. À l'issue de la préparation, un réseau doit être soit `HUMAN_OAUTH_APPROVAL_REQUIRED`, soit dans une phase `EXTERNAL_*` décrivant précisément le blocage externe restant.

## Règles de sécurité

- Aucun mot de passe, client secret, access token ou refresh token dans Airtable, GitHub, les prompts ou les logs.
- Les secrets d'application restent dans les variables serveur Vercel.
- Les tokens OAuth utilisateur sont chiffrés dans le coffre AES-256-GCM côté serveur.
- `social_test_mode=TRUE` et la validation humaine des publications restent actifs pendant les tests.
- Aucun achat/plan/crédit X n'est engagé automatiquement.
- Aucun contournement par cookie, scraping de session ou automatisation d'interface privée.
- Metricool est une voie opérationnelle de secours, pas une preuve que l'API directe Hibou est autorisée.

## État cible par réseau avant la session humaine

| Réseau | Voie ChatGPT actuelle | Phase externe avant secrets/app | Étape finale attendue |
|---|---|---|---|
| YouTube | Metricool | `EXTERNAL_GOOGLE_OAUTH_APP_SETUP_REQUIRED` | `HUMAN_OAUTH_APPROVAL_REQUIRED` |
| Instagram | Metricool | `EXTERNAL_META_APP_SETUP_REQUIRED` | `HUMAN_OAUTH_APPROVAL_REQUIRED` |
| Facebook | Metricool | `EXTERNAL_META_APP_SETUP_REQUIRED` | `HUMAN_OAUTH_APPROVAL_REQUIRED` |
| TikTok | Metricool | `EXTERNAL_TIKTOK_APP_PRODUCT_APPROVAL_REQUIRED` | OAuth possible après app/secrets ; public direct reste bloqué par audit tant qu'il n'est pas accordé |
| LinkedIn | Metricool | `EXTERNAL_LINKEDIN_COMMUNITY_MANAGEMENT_ACCESS_REQUIRED` | OAuth après produits/permissions approuvés |
| Pinterest | Metricool | `EXTERNAL_PINTEREST_TRIAL_ACCESS_APPROVAL_REQUIRED` | OAuth après Trial + secrets ; Standard Access pour production complète |
| Threads | Metricool | `EXTERNAL_THREADS_APP_SETUP_REQUIRED` | `HUMAN_OAUTH_APPROVAL_REQUIRED` |
| X | aucune voie connectée | `EXTERNAL_X_API_ACCESS_AND_BILLING_APPROVAL_REQUIRED` | OAuth seulement après choix explicite d'accès/coût |
| Snapchat | aucune voie connectée | `EXTERNAL_SNAP_PRODUCT_APPROVAL_REQUIRED` | reprise uniquement après produit/API Snap officiellement accordé |

## Callbacks canoniques

Tant que `d4d5d6.com` n'est pas validé, utiliser l'origine canonique suivante :

`https://le-hibou-ruse-site.vercel.app`

Les callbacks exacts sont générés par le control plane et synchronisés dans Airtable. Ne pas les retaper à la main si le control plane affiche une valeur différente.

## Control plane

- Vue humaine : `/admin/social/control-plane`
- État machine : `/api/social/control-plane`
- OAuth : `/api/social/oauth/<provider>/start`
- Gateway social : `/api/social`
- Suivi TikTok après upload : `POST /api/social` avec `operation=publication_status`, `provider=tiktok`, `publish_id=<id>`.

L'accès machine au control plane utilise `HIBOU_CONTROL_PLANE_SECRET`, avec `CRON_SECRET` comme secours si le secret dédié n'est pas configuré.

## Ordre recommandé pour la future session humaine

1. Google / YouTube.
2. Meta / Facebook + Instagram.
3. Threads.
4. TikTok.
5. Pinterest.
6. LinkedIn.
7. X uniquement après décision explicite sur l'accès/coût.
8. Snapchat uniquement si Snap a accordé le produit/API requis.

Après chaque création d'app :

1. déclarer le callback exact affiché dans Airtable ;
2. mettre Client ID / Client Secret dans Vercel, jamais dans Airtable ;
3. attendre le redéploiement ;
4. synchroniser le control plane ;
5. vérifier que la phase devient `HUMAN_OAUTH_APPROVAL_REQUIRED` ;
6. seulement alors cliquer sur « Valider l'autorisation » ;
7. vérifier ensuite scopes publication + analytics et exécuter des tests non publics/sandbox/SELF_ONLY avant tout live.

## TikTok : finalisation asynchrone

Un `publish_id` n'est pas un `post_id`. Le gateway expose désormais le statut officiel TikTok via `publication_status`. Le vrai `post_id` n'est enregistré comme publication finale que lorsqu'il est effectivement disponible. Un statut `FAILED` doit remonter son `fail_reason`; une attente longue ne doit jamais provoquer une republication aveugle avec une nouvelle clé d'idempotence.
