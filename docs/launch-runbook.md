# Le Hibou Rusé — runbook de lancement

Ce document liste uniquement les dépendances externes qui restent une fois le code prêt. Aucun secret ne doit être commité dans GitHub ou Airtable.

## 1. URL publique

- URL publique principale retenue : `https://le-hibou-ruse-site.vercel.app`.
- Vérifier que `/api/site-identity` répond bien `site=Le Hibou Rusé` et `canonical=true` sur cet alias.
- `d4d5d6.com` n’est plus le visage public du projet ; il peut rester un alias secondaire et rediriger vers le Vercel brandé si on décide de le raccorder plus tard.
- Ne jamais activer une redirection canonique avant d’avoir vérifié l’alias de destination.

## 2. Lemon Squeezy

- Finaliser KYC, compte bancaire et activation live.
- Créer/valider le produit Le Hibou Rusé à 29 € et son variant live.
- Renseigner l’URL checkout live et le Variant ID dans Airtable.
- Configurer le webhook vers l’endpoint commerce du site avec un secret serveur.
- Rediriger après achat vers `/merci`.
- Effectuer un achat réel contrôlé avant toute ouverture publique.
- Ne jamais utiliser un checkout test pour livrer un vrai client.

## 3. Digify

- Activer l’accès API Digify.
- Stocker `DIGIFY_KEY_ID`, `DIGIFY_SECRET` et les templates API uniquement côté serveur.
- Après validation du livre, exporter le PDF maître et le charger dans Digify.
- Renseigner le File GUID final du produit.
- Tester de bout en bout : commande → accès nominatif → vue → remboursement → révocation.

## 4. Réseaux sociaux directs

Le broker OAuth est accessible sur `/admin/social`. Les jetons sont stockés chiffrés dans Airtable `Social Credentials`; aucun jeton en clair ne doit être copié dans Airtable, GitHub ou un prompt.

### YouTube
Callback : `https://le-hibou-ruse-site.vercel.app/api/social/oauth/youtube/callback`
- Créer/configurer l’app Google OAuth.
- Variables serveur : client ID et client secret Google/YouTube.
- Autoriser le compte une fois via `/admin/social`.
- Vérifier que le refresh token est bien conservé et qu’un upload privé dry-run/test fonctionne avant publication publique.

### Meta — Instagram + Facebook
Callback : `https://le-hibou-ruse-site.vercel.app/api/social/oauth/meta/callback`
- Créer/configurer l’app Meta.
- Demander les permissions nécessaires à la Page et au compte Instagram Business.
- Variables serveur : app ID/client ID et secret Meta.
- Autoriser une fois via `/admin/social`.
- Le broker doit résoudre Page ID, Page access token et Instagram Business Account ID.

### TikTok
Callback : `https://le-hibou-ruse-site.vercel.app/api/social/oauth/tiktok/callback`
- Créer l’app développeur TikTok.
- Autoriser `user.info.basic`, `video.publish`, `video.upload` selon l’accès réellement accordé.
- Variables serveur : client key et client secret.
- Autoriser via `/admin/social`.
- Avant audit TikTok, maintenir le direct en `SELF_ONLY`; ne pas contourner l’audit pour publier publiquement.

### LinkedIn
Callback : `https://le-hibou-ruse-site.vercel.app/api/social/oauth/linkedin/callback`
- Créer/configurer l’app LinkedIn.
- Autoriser `w_member_social` et les scopes réellement disponibles.
- Variables serveur : client ID, client secret, version API LinkedIn.
- Autoriser via `/admin/social` puis vérifier l’URN auteur.

### X
Callback : `https://le-hibou-ruse-site.vercel.app/api/social/oauth/x/callback`
- Créer/configurer l’app développeur X avec écriture et média.
- Autoriser `tweet.read users.read tweet.write offline.access` selon le plan réellement disponible.
- Variables serveur : client ID et, si nécessaire, client secret.
- Autoriser via `/admin/social`; vérifier refresh et upload vidéo natif avant live.

### Threads
Callback : `https://le-hibou-ruse-site.vercel.app/api/social/oauth/threads/callback`
- Configurer l’app Threads/Meta.
- Autoriser `threads_basic` et `threads_content_publish`.
- Variables serveur : client ID/app ID et secret Threads/Meta.
- Autoriser via `/admin/social` et vérifier le refresh long-lived.

### Snapchat
- Aucun faux connecteur n’est utilisé.
- La publication organique serveur reste conditionnée à l’accès Public Profile API / produit Snap et à l’approbation du compte.

## 5. Croissance et attribution

- Chaque contenu social doit utiliser un `utm_source`, `utm_campaign` et `utm_content` distinct quand la plateforme permet un lien traçable.
- L’URL de destination par défaut est `https://le-hibou-ruse-site.vercel.app`.
- Le site conserve l’attribution first-party, journalise `landing` et `checkout_click`, puis transmet la campagne à Lemon Squeezy via les custom data du checkout.
- Le webhook Lemon rattache ensuite la vente à son réseau/campagne/création dans Airtable.
- `/admin/growth` sert de tableau privé d’arbitrage : la priorité est le revenu/visiteur et le taux visite→achat, pas le nombre de likes seul.

## 6. Livre

- Les 13 chapitres corpus sont générés par lots de 5 et réconciliés automatiquement.
- Une fois 13/13 complets, le finaliseur génère automatiquement, un bloc par wake : ouverture → annexe lignes rouges → conclusion.
- Aucun bloc n’est automatiquement marqué `Validation humaine=true` ni `Prêt export=true`.
- Après relecture humaine, fixer une édition non-draft, exporter le PDF maître et le charger dans Digify.

## 7. Juridique avant vente

Compléter réellement avant ouverture commerciale :
- identité de l’entité éditrice/vendeuse, forme, capital le cas échéant, siège, SIREN/RCS, email de contact ;
- directeur de publication si requis ;
- médiateur de la consommation ;
- politique de conservation et transferts de données réellement retenue ;
- mécanisme de consentement requis pour l’exécution immédiate du contenu numérique et traitement du droit de rétractation ;
- validation finale des CGV, mentions légales et confidentialité.

## 8. Go live

Le checkout ne doit s’ouvrir que lorsque le readiness strict est vert : URL publique vérifiée, paiement live, webhook, édition finale, 16/16 blocs livre prêts, Digify final, API Digify et documents juridiques validés. Réaliser au moins un achat réel contrôlé et une livraison/révocation réelle avant activation publique.
