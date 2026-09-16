# Work — Lemon Squeezy + Digify test E2E

Objectif : configurer et tester le tunnel Lemon Squeezy → webhook Hibou → Airtable et, séparément, la sécurité Digify, sans ouvrir les ventes publiques et sans paiement réel pendant cette session de test.

## Garde-fous non négociables

- `commerce_launch_authorized` reste `false` pendant toute cette session sandbox/test mode.
- `lemon_test_mode_only` reste `TRUE`.
- Aucun checkout live n'est créé ni publié sur le site dans cette session.
- Aucun secret n'est écrit dans Airtable, GitHub, une issue, un log ou un chat.
- Les secrets Lemon/Webhook/Digify sont saisis directement dans Vercel.
- Tout CAPTCHA, nouvelle 2FA, validation bancaire, consentement contractuel personnel, upgrade payant ou action irréversible impose un arrêt et une demande à Marc.
- Le PDF partiel est uniquement un fichier de test et ne doit jamais être livré via une vente live.
- Un achat Lemon `test_mode=true` ne doit jamais créer ni révoquer un accès Digify réel.
- Aucun lien Digify générique/public ne doit servir de mécanisme de livraison : uniquement un Quick Access Link nominatif ou la notification Digify individuelle.

## Actif de test

PDF Library à retrouver par son nom exact :

`Le_Hibou_Ruse_Livre_Partiel_V1.0_2026-09.pdf`

Le document porte explicitement l'édition draft et contient des chapitres encore en génération. Il sera remplacé sur le même produit Lemon et dans Digify par le PDF final avant le lancement.

## Phase 1 — Produit Lemon (interface, une seule fois)

1. Ouvrir Lemon Squeezy avec le compte déjà authentifié.
2. Créer le vrai produit : `Le guide du Hibou Rusé`.
3. Type : produit numérique / paiement unique.
4. Prix : `29 €`.
5. Charger le PDF partiel ci-dessus comme fichier temporaire.
6. Ne pas activer de license keys.
7. Utiliser la description stockée dans Airtable Configuration sous `lemon_product_description`.
8. Ne pas connecter de bouton public du site au checkout.
9. Conserver le produit sans exposition publique supplémentaire si l'interface le permet.
10. Relever uniquement les identifiants non secrets si l'interface les montre ; sinon l'API les découvrira.

Preuve attendue : produit créé, variant à 29 €, PDF partiel attaché.

## Phase 2 — Clé API Lemon (interface + Vercel)

1. Lemon Squeezy → Settings → API.
2. Créer une clé dédiée nommée `HIBOU_AGENT_V1`.
3. Ne pas coller la clé dans le chat.
4. Ouvrir Vercel → projet `le-hibou-ruse-site` → Environment Variables.
5. Ajouter `LEMON_SQUEEZY_API_KEY` avec la valeur de la clé Lemon, côté serveur.
6. Appliquer au minimum à Production ; ajouter Preview uniquement si un test l'exige réellement.
7. Ne jamais mettre cette valeur dans GitHub/Airtable.

Preuve attendue : variable présente dans Vercel, valeur jamais exposée.

## Phase 3 — Secret webhook (Vercel)

1. Générer une valeur aléatoire de 32 à 40 caractères dans le contexte sécurisé Work/browser.
2. Ajouter directement dans Vercel : `LEMON_SQUEEZY_WEBHOOK_SECRET`.
3. Ne jamais recopier la valeur dans Airtable/GitHub/chat.

Preuve attendue : variable présente dans Vercel, valeur jamais exposée.

## Phase 4 — Vérifier store et payout

Relever uniquement les statuts non secrets :

- store : approved / pending / review ;
- payout : configured / pending / unknown.

Ne déclencher ni payout ni achat live. Toute demande de coordonnées bancaires ou validation personnelle revient à Marc.

## Phase 5 — Déployer le bootstrap API

Attendre que Vercel accepte de nouveau les builds, puis fusionner la release candidate #118 et vérifier que le commit `main` correspondant est réellement déployé avant tout appel de bootstrap.

Route : `POST /api/commerce/lemon-bootstrap`.

Authentification : **GitHub OIDC uniquement**, limitée au workflow manuel `lemon-commerce-test.yml` et à l'événement `workflow_dispatch`.

Actions autorisées uniquement :

- `inspect`
- `checkout_test`
- `webhook_test`

Aucune action live n'existe dans cette route. Un 404 de propagation est toléré pendant trois essais espacés de 15 secondes puis échoue franchement.

## Phase 6 — Découverte API

Lancer GitHub Actions → `Hibou Lemon Commerce Test` → `inspect`.

Résultat attendu :

- API Lemon authentifiée ;
- un store sélectionné sans ambiguïté ;
- produit exact `Le guide du Hibou Rusé` trouvé ;
- variant non-abonnement à 2900 centimes trouvé ;
- Store ID / Product ID / Variant ID enregistrés dans Airtable ;
- `lemon_api_status=CONNECTED_TEST_ONLY` ;
- IDs produit/variant également écrits dans `Produits site` ;
- aucun checkout créé par cette action.

En cas de plusieurs stores ou variants ambigus : arrêter et ne rien deviner.

## Phase 7 — Checkout TEST par API

Lancer `Hibou Lemon Commerce Test` → `checkout_test`.

La route doit créer uniquement un checkout `test_mode=true` avec :

- produit `Le guide du Hibou Rusé` ;
- variant exact 29 € ;
- locale française ;
- redirection temporaire : `https://le-hibou-ruse-site.vercel.app/merci?order=[order_identifier]` ;
- bouton reçu : `Lire mon guide` ;
- lien reçu identique ;
- description Airtable ;
- aucun code promo affiché.

Le checkout de test est stocké uniquement dans Configuration (`lemon_test_checkout_id`, `lemon_test_checkout_url`). Ne pas remplir le champ de checkout LIVE du produit. Si un checkout de test est déjà enregistré, la route le relit chez Lemon et ne le réutilise que si `test_mode`, Store ID, Variant ID et URL HTTPS Lemon correspondent encore ; un 404 permet une recréation, une incohérence bloque le workflow.

## Phase 8 — Webhook TEST par API

Lancer `Hibou Lemon Commerce Test` → `webhook_test`.

Résultat attendu : webhook `test_mode=true` vers :

`https://le-hibou-ruse-site.vercel.app/api/commerce/lemon-webhook`

Événements :

- `order_created`
- `order_refunded`

Si un webhook identique existe, le réutiliser. Si le même endpoint existe avec une configuration incompatible, arrêter plutôt que créer des doublons.

## Phase 9 — Digify test sécurisé

### Compte et API

1. Ouvrir ou créer le compte Digify du Hibou.
2. Developer Portal → créer une clé API dédiée `HIBOU_AGENT_V1`.
3. Saisir directement dans Vercel :
   - `DIGIFY_KEY_ID`
   - `DIGIFY_SECRET`
4. Créer deux valeurs longues et uniques, indépendantes des credentials API Digify, et les saisir uniquement dans Vercel :
   - `DIGIFY_WEBHOOK_USERNAME`
   - `DIGIFY_WEBHOOK_PASSWORD`
5. Ne jamais recopier `DIGIFY_SECRET`, le username webhook ou le password webhook dans Airtable/GitHub/chat.

### Fichier temporaire

Charger `Le_Hibou_Ruse_Livre_Partiel_V1.0_2026-09.pdf` dans Document Security avec :

- accès : `Only people I specify (quick access links)` ;
- download : désactivé ;
- print : désactivé ;
- watermark dynamique : email + date/heure ;
- pas de lien public générique utilisé comme livraison.

Enregistrer uniquement le File GUID/ID non secret dans `Produits site > Digify File GUID`.

### Schéma API actuel

Dans le Developer Portal 2026, relever **sans extrapoler d'une ancienne doc** les endpoints et payloads officiels actuels pour :

- ajouter un destinataire Quick Access au fichier ;
- récupérer son lien personnalisé ;
- révoquer/supprimer son accès.

Configurer directement dans Vercel :

- `DIGIFY_ADD_RECIPIENT_URL`
- `DIGIFY_ADD_RECIPIENT_BODY_TEMPLATE`
- `DIGIFY_REVOKE_RECIPIENT_URL`
- `DIGIFY_REVOKE_RECIPIENT_BODY_TEMPLATE`

Les deux URLs doivent être HTTPS sur `api.digify.com`. Le runtime les refusera sinon. Ne jamais inventer un endpoint ou un payload Digify à partir d'une ancienne documentation.

### Webhook d'activité Digify

Configurer côté Digify le webhook d'activité vers :

`https://le-hibou-ruse-site.vercel.app/api/commerce/digify-webhook`

Protection obligatoire : Basic Auth utilisant exactement `DIGIFY_WEBHOOK_USERNAME` et `DIGIFY_WEBHOOK_PASSWORD`. Ces credentials sont indépendants de `DIGIFY_KEY_ID` / `DIGIFY_SECRET`.

Le runtime n'accepte que les événements `View`, `Print` et `Download`, exige `RecipientUserEmail` pour rattacher l'événement à une vente et refuse tout lien qui n'est pas HTTPS sur `digify.com` ou un sous-domaine. `Print` et `Download` doivent être journalisés comme **Policy Alert**, car la politique du Hibou les désactive.

### Test destinataire

1. Ajouter une adresse de test contrôlée.
2. Récupérer son Quick Access Link individuel.
3. Ouvrir dans un navigateur privé.
4. Vérifier lecture immédiate, watermark, absence de download/print.
5. Vérifier qu'un événement `View` atteint le webhook d'activité et se rattache à l'email nominatif attendu.
6. Révoquer l'accès.
7. Vérifier que le même lien ne permet plus la lecture.
8. Ne pas provoquer volontairement un `Print`/`Download` si Digify les bloque correctement ; si un tel événement apparaît malgré tout, il doit remonter en **Policy Alert** et déclencher une revue de configuration.

## Phase 10 — Achat de test Lemon

1. Ouvrir exclusivement `lemon_test_checkout_url`.
2. Utiliser le mode/moyen de paiement de test Lemon ; ne jamais utiliser un moyen de paiement réel pour cette phase.
3. Terminer une commande de test.
4. Vérifier le webhook `order_created`.
5. Vérifier dans Airtable Ventes : commande créée/dédupliquée, `Identifiant commande public`, email de test, montant/devise, état de livraison.
6. Le webhook Hibou doit détecter `test_mode=true` et fixer `Livraison statut=manual_review` avec la mention que la livraison est bloquée.
7. `/merci?order=[order_identifier]` ne doit jamais révéler de lien Digify pour cette commande test.
8. Effectuer ensuite un remboursement Lemon de test et vérifier l'état remboursé/révoqué dans Airtable, sans appeler l'API Digify.

## Phase 11 — Test Digify séparé

Le test Digify de la phase 9 est indépendant du faux achat Lemon. Il valide techniquement ajout, Quick Access Link, activité nominative et révocation avec un destinataire contrôlé, mais ne doit pas être relié à une commande `test_mode=true`.

## Phase 12 — Passage live ultérieur, séparé

Ne pas exécuter dans cette session de test.

Préconditions :

- PDF final V1 ;
- validation humaine du livre ;
- fichier Digify final et test de révocation réussi ;
- webhook d'activité Digify protégé et testé ;
- domaine `d4d5d6.com` vérifié ;
- juridique validé ;
- payout/store Lemon confirmé ;
- webhook live séparé ;
- checkout live séparé.

### Fenêtre de validation live contrôlée

Le test complet Lemon → Digify nécessite temporairement l'autorisation de livraison réelle. Il doit rester distinct de l'ouverture publique :

1. créer/configurer le checkout live dans Lemon mais **ne pas renseigner `Configuration.checkout_url` et ne pas le publier sur le site** ;
2. vérifier que toutes les autres préconditions live sont satisfaites ;
3. passer explicitement `commerce_launch_authorized=true` uniquement pour la fenêtre de test ;
4. ouvrir manuellement le checkout live privé depuis Lemon et effectuer un seul achat réel contrôlé à 29 € ;
5. vérifier webhook signé → vente Airtable unique → accès Digify nominatif → `/merci` ;
6. remettre immédiatement `commerce_launch_authorized=false` après confirmation de la livraison ;
7. effectuer le remboursement contrôlé et vérifier la révocation Digify ;
8. en cas d'échec, garder le switch à `false` et ne pas publier le checkout.

### Ouverture publique, plus tard

Après succès de la fenêtre de validation et revue finale :

1. renseigner `Configuration.checkout_url` avec le checkout LIVE validé ;
2. vérifier de nouveau tous les contrôles stricts ;
3. passer explicitement `commerce_launch_authorized=true` ;
4. vérifier que le site public expose uniquement le checkout LIVE attendu.
