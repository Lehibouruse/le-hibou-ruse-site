# Le Hibou Rusé — runbook d'autorisation des réseaux

Objectif : pousser automatiquement chaque réseau jusqu'au dernier point techniquement possible sans consentement du propriétaire du compte. À l'issue de la préparation, un réseau doit être soit `HUMAN_OAUTH_APPROVAL_REQUIRED`, soit dans une phase `EXTERNAL_*` décrivant précisément le blocage externe restant.

## Règles de sécurité

- Aucun mot de passe, client secret, access token ou refresh token dans Airtable, GitHub, les prompts ou les logs.
- Les secrets d'application restent dans les variables serveur Vercel.
- Les tokens OAuth utilisateur sont chiffrés dans le coffre AES-256-GCM côté serveur.
- La configuration non secrète (scopes, versions API, IDs publics/cibles, modes) est centralisée dans Airtable et injectée via une liste blanche.
- `social_test_mode=TRUE` et la validation humaine des publications restent actifs pendant les tests.
- Aucun achat/plan/crédit X n'est engagé automatiquement.
- Aucun contournement par cookie, scraping de session ou automatisation d'interface privée.
- Metricool est une voie opérationnelle de secours, pas une preuve que l'API directe Hibou est autorisée.

## Voies déjà opérationnelles depuis ChatGPT

La marque Metricool du Hibou est reliée à YouTube, Instagram, Facebook, Threads, LinkedIn, Pinterest et TikTok. Ces sept réseaux restent donc pilotables depuis ChatGPT pendant la préparation des API directes. X et Snapchat n'ont pas cette voie de secours confirmée.

## État terminal préparé par réseau

| Réseau | Voie actuelle | Blocage externe direct exact | État visé avant clic utilisateur |
|---|---|---|---|
| YouTube | Metricool | Projet Google Cloud + YouTube Data API v3 + YouTube Analytics API + client OAuth Web + callback + Client ID/Secret | `HUMAN_OAUTH_APPROVAL_REQUIRED` |
| Instagram | Metricool | Instagram API with Instagram Login / Business Login + compte Instagram professionnel + callback dédié + Instagram App ID/Secret | `HUMAN_OAUTH_APPROVAL_REQUIRED` |
| Facebook | API officielle directe + Metricool fallback | Facebook Login for Business + Page cible + permissions Page/Insights. OAuth Hibou déjà connecté au 20/09/2026. | `AUTHORIZED` |
| Threads | Metricool | App Threads Meta + callback + App ID/Secret | `HUMAN_OAUTH_APPROVAL_REQUIRED` |
| TikTok | Metricool | App + Login Kit + Content Posting API + scopes ; audit pour public ; domaine/préfixe média vérifié pour les photos `PULL_FROM_URL` | OAuth possible après app/secrets ; tests `SELF_ONLY` avant audit |
| Pinterest | Metricool | App + Trial Access + callback + App ID/Secret ; board cible après OAuth ; Standard Access pour production complète | OAuth après Trial + secrets |
| LinkedIn | Metricool | Community Management API + rôle `ADMINISTRATOR` de la Page + `w_organization_social` + `rw_organization_admin` + Client ID/Secret | OAuth après accès produit/app |
| X | aucune voie confirmée | Choix de l'accès API et de son coût + app OAuth 2.0 write ; toute dépense exige une validation humaine explicite | OAuth seulement après décision coût/accès |
| Snapchat | aucune voie confirmée | Produit/API Snap officiellement accordé pour la publication organique serveur | reprise seulement après approbation Snap |

## Scopes préparés

### YouTube

- publication : `https://www.googleapis.com/auth/youtube`
- lecture : `https://www.googleapis.com/auth/youtube.readonly`
- rétention/analytics : `https://www.googleapis.com/auth/yt-analytics.readonly`

Le pipeline Social Performance sait conserver les compteurs Data API et, lorsque YouTube Analytics est autorisé, ajouter watch time, durée moyenne, taux moyen de visionnage, abonnés gagnés et partages.

### Meta — Facebook

`pages_show_list,pages_manage_posts,pages_read_engagement,read_insights`

### Instagram — Instagram Business Login

`instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights`

Instagram utilise son propre App ID/Secret, son propre callback et `graph.instagram.com`. Ne pas remettre les scopes Instagram dans le dialogue OAuth Facebook.

### TikTok

`user.info.basic,user.info.profile,user.info.stats,video.list,video.publish,video.upload`

Le gateway sait préparer vidéo et photo/carrousel. Les photos directes utilisent `PULL_FROM_URL`; le domaine/préfixe des médias doit être vérifié côté TikTok. Tant que l'app n'est pas auditée, les tests directs restent `SELF_ONLY`.

### Threads

`threads_basic,threads_content_publish,threads_manage_insights`

### Pinterest

`boards:read,boards:write,pins:read,pins:write,user_accounts:read`

### LinkedIn — organisation

`openid profile w_member_social w_organization_social r_organization_social rw_organization_admin`

La cible principale est l'organisation `urn:li:organization:146337938`. Le reporting direct utilise les statistiques organiques des publications de l'organisation ; le chemin profil membre reste un fallback si la cible organisation est retirée.

### X

`tweet.read tweet.write users.read offline.access media.write`

Aucun plan, crédit ou paiement n'est activé automatiquement.

## Callbacks canoniques

Le domaine public canonique est désormais `https://d4d5d6.com`.

Facebook :

`https://d4d5d6.com/api/social/oauth/meta/callback`

Instagram Business Login :

`https://d4d5d6.com/api/social/oauth/instagram/callback`

Les callbacks exacts sont générés par le control plane et synchronisés dans Airtable. Ne pas mélanger les deux providers ni utiliser un autre callback sans modifier d'abord la configuration serveur.

## Control plane

- Vue humaine : `/admin/social/control-plane`
- Vue OAuth simplifiée : `/admin/social`
- État machine : `/api/social/control-plane`
- OAuth : `/api/social/oauth/<provider>/start`
- Gateway social : `/api/social`
- Suivi TikTok après initialisation : `POST /api/social` avec `operation=publication_status`, `provider=tiktok`, `publish_id=<id>`.

Le control plane et les écrans admin lisent la même configuration non secrète Airtable. L'accès machine utilise `HIBOU_CONTROL_PLANE_SECRET`, avec `CRON_SECRET` comme secours si le secret dédié n'est pas configuré.

## Ordre recommandé pour la session humaine courte

1. Instagram Business Login — priorité actuelle.
2. Google / YouTube.
3. Threads.
4. TikTok.
5. Pinterest.
6. LinkedIn.
7. X uniquement après décision explicite sur l'accès/coût.
8. Snapchat uniquement si Snap a accordé le produit/API requis.

Facebook est déjà connecté via l'API officielle directe et ne doit pas être reconnecté pour autoriser Instagram.

Après chaque création/configuration d'app :

1. déclarer le callback exact affiché dans Airtable ;
2. mettre Client ID / Client Secret dans Vercel, jamais dans Airtable ;
3. attendre le redéploiement ;
4. synchroniser le control plane ;
5. vérifier que la phase devient `HUMAN_OAUTH_APPROVAL_REQUIRED` lorsqu'aucune approbation produit supplémentaire ne manque ;
6. seulement alors cliquer sur « Valider l'autorisation » ;
7. vérifier scopes publication + analytics ;
8. exécuter uniquement des dry-runs/sandbox/privé/SELF_ONLY jusqu'à validation du réseau concerné ;
9. conserver `social_test_mode=TRUE` et `social_publication_requires_review=TRUE` pendant cette phase.

## TikTok : finalisation asynchrone

Un `publish_id` n'est pas un `post_id`. Le gateway expose le statut TikTok via `publication_status`. Le vrai `post_id` n'est enregistré comme publication finale que lorsqu'il est effectivement disponible. Un statut `FAILED` doit remonter son `fail_reason`; une attente longue ne doit jamais provoquer une republication aveugle avec une nouvelle clé d'idempotence.

## Frontière d'automatisation

À ce stade, le code peut préparer les adapters, callbacks, scopes, stockage chiffré, refresh supporté, dry-runs, métriques, idempotence, synchronisation Airtable et diagnostics. Les étapes qui restent volontairement humaines ou externes sont : création/approbation des apps chez les fournisseurs, saisie des Client Secrets dans l'environnement serveur, consentement OAuth/2FA, validation de domaines exigée par un fournisseur, rôle administrateur lorsque le fournisseur l'impose, approbation produit/API et tout engagement financier.


## Instagram — session humaine minimale

Le backend Instagram est prêt séparément de Facebook : Instagram Business Login, callback dédié, échange du jeton court vers un jeton long-lived, chiffrement AES-256-GCM, lecture du profil professionnel, publication, analytics et synchronisation Airtable. Le correctif de pagination #164 garantit aussi que les routes OAuth lisent toute la table Configuration au-delà de 100 lignes.

État au 20/09/2026 : le compte Instagram du Hibou est déjà enregistré comme Professionnel / créateur et reste opérationnel via Metricool. Facebook est `AUTHORIZED` séparément. Il ne faut donc pas reconnecter Facebook pour finaliser Instagram.

Actions humaines restantes :
1. dans Meta for Developers, ouvrir l'app du Hibou et configurer **Instagram API with Instagram Login / Business Login** ;
2. déclarer exactement le callback `https://d4d5d6.com/api/social/oauth/instagram/callback` ;
3. demander/configurer `instagram_business_basic`, `instagram_business_content_publish` et `instagram_business_manage_insights` ;
4. si Meta demande les URL de conformité, utiliser le site `https://d4d5d6.com`, la politique `https://d4d5d6.com/confidentialite` et la suppression des données `https://d4d5d6.com/suppression-donnees` ;
5. copier l'Instagram App ID et l'Instagram App Secret dans Vercel Production sous `INSTAGRAM_APP_ID` et `INSTAGRAM_APP_SECRET` ; ne jamais les mettre dans Airtable, GitHub ou un chat ;
6. laisser `INSTAGRAM_GRAPH_VERSION=v26.0` et les scopes par défaut sauf nécessité documentée ;
7. après redéploiement, ouvrir `https://d4d5d6.com/api/social/oauth/instagram/start` depuis la session admin et approuver personnellement l'autorisation Instagram.

Après le callback, le runtime doit créer un credential `instagram` chiffré, exécuter un test de lecture et synchroniser le control plane. Aucune publication réelle n'est nécessaire pour valider l'authentification.

Le coffre OAuth peut utiliser `HIBOU_SOCIAL_VAULT_KEY` lorsqu'une clé dédiée existe ; sinon il dérive une clé séparée à partir de `CRON_SECRET`, déjà secret serveur, avec séparation de domaine cryptographique.
