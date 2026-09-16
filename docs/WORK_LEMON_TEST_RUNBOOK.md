# Work — Lemon Squeezy + Digify test flows

Objectif : configurer et tester séparément le tunnel Lemon Squeezy → webhook Hibou → Airtable et la livraison Digify, sans ouvrir les ventes publiques et sans paiement réel. L’intégration complète Lemon → Digify sera testée seulement avec un achat réel contrôlé juste avant le lancement public.

## Garde-fous non négociables

- `commerce_launch_authorized` reste `false`.
- `lemon_test_mode_only` reste `TRUE`.
- Aucun checkout live n'est créé ni publié sur le site.
- Aucun secret n'est écrit dans Airtable, GitHub, une issue, un log ou un chat.
- Les secrets Lemon/Webhook/Digify sont saisis directement dans Vercel.
- Tout CAPTCHA, nouvelle 2FA, validation bancaire, consentement contractuel personnel, upgrade payant ou action irréversible impose un arrêt et une demande à Marc.
- Le PDF partiel est uniquement un fichier de test et ne doit jamais être livré via une vente live.
- Une commande Lemon `test_mode=true` ne doit jamais déclencher de livraison Digify. Elle reste volontairement en `manual_review`.

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
- langue : français ;
- redirection temporaire : `https://le-hibou-ruse-site.vercel.app/merci?order=[order_identifier]` ;
- bouton reçu : `Lire mon guide` ;
- lien reçu identique ;
- description Airtable ;
- aucun code promo affiché.

Le checkout de test est stocké uniquement dans Configuration (`lemon_test_checkout_id`, `lemon_test_checkout_url`). Ne pas remplir le champ de checkout LIVE du produit. Si un checkout test est déjà enregistré, la route le relit chez Lemon et vérifie `test_mode`, Store ID, Variant ID et URL avant réutilisation. Un checkout disparu (404) peut être recréé ; un checkout incompatible bloque le workflow.

## Phase 8 — Webhook TEST par API

Lancer `Hibou Lemon Commerce Test` → `webhook_test`.

Résultat attendu : webhook `test_mode=true` vers :

`https://le-hibou-ruse-site.vercel.app/api/commerce/lemon-webhook`

Événements :

- `order_created`
- `order_refunded`

Si un webhook identique existe, le réutiliser. Si le même endpoint existe avec une configuration incompatible, arrêter plutôt que créer des doublons.

## Phase 9 — Digify test sécurisé, séparé de Lemon

### Compte et API

1. Ouvrir ou créer le compte Digify du Hibou.
2. Developer Portal → créer une clé API dédiée `HIBOU_AGENT_V1`.
3. Saisir directement dans Vercel :
   - `DIGIFY_KEY_ID`
   - `DIGIFY_SECRET`
4. Ne jamais recopier `DIGIFY_SECRET` dans Airtable/GitHub/chat.

### Fichier temporaire

Charger `Le_Hibou_Ruse_Livre_Partiel_V1.0_2026-09.pdf` dans Document Security avec :

- accès : `Only people I specify (quick access links)` ;
- download : désactivé ;
- print : désactivé ;
- watermark dynamique : email + date/heure ;
- pas de lien public générique utilisé comme livraison.

Enregistrer uniquement le File GUID/ID non secret dans `Produits site > Digify File GUID`.

### Schéma API actuel

Dans le Developer Portal 2026, relever les endpoints et payloads officiels actuels pour :

- ajouter un destinataire Quick Access au fichier ;
- récupérer son lien personnalisé ;
- révoquer/supprimer son accès.

Configurer directement dans Vercel :

- `DIGIFY_ADD_RECIPIENT_BODY_TEMPLATE`
- `DIGIFY_REVOKE_RECIPIENT_URL`
- `DIGIFY_REVOKE_RECIPIENT_BODY_TEMPLATE`

Ne jamais inventer un endpoint ou un payload Digify à partir d'une ancienne documentation.

### Test destinataire Digify

1. Ajouter une adresse de test contrôlée directement via Digify/API.
2. Récupérer son Quick Access Link.
3. Ouvrir dans un navigateur privé.
4. Vérifier lecture immédiate, watermark, absence de download/print.
5. Révoquer l'accès.
6. Vérifier que le même lien ne permet plus la lecture.

Ce test Digify est indépendant de la commande Lemon de test.

## Phase 10 — Achat de test Lemon, sans Digify

1. Ouvrir exclusivement `lemon_test_checkout_url`.
2. Utiliser le mode/moyen de paiement de test Lemon ; ne jamais utiliser un moyen de paiement réel pour cette phase.
3. Terminer une commande de test.
4. Vérifier le webhook `order_created`.
5. Vérifier dans Airtable Ventes : commande créée/dédupliquée, `Identifiant commande public`, email de test, montant/devise.
6. Vérifier explicitement `test_mode=true` dans l'audit de commande.
7. Vérifier `Livraison statut=manual_review` : aucune livraison Digify ne doit être créée pour cette commande test.
8. Vérifier que `/merci?order=[order_identifier]` ne révèle aucun lien Digify et reste en traitement/revue.
9. Effectuer un remboursement de test.
10. Vérifier la transition `refunded/revoked` sans qu'aucune livraison Digify n'ait eu lieu.

## Phase 11 — Remplacement par la V1 finale

Après validation humaine par Marc de la première V1 vendable :

- remplacer le PDF temporaire du produit Lemon existant sans recréer Product/Variant IDs ;
- remplacer le fichier Digify ou mettre à jour le File GUID correspondant ;
- mettre à jour `book_current_edition` ;
- rejouer le test Digify lecture/révocation ;
- rejouer `inspect`, `checkout_test` et `webhook_test` si nécessaire ;
- conserver `commerce_launch_authorized=false`.

## Phase 12 — Intégration complète contrôlée avant lancement

Seulement quand le livre final, Digify, domaine, juridique, payout/store Lemon et configuration live sont prêts :

1. créer un webhook LIVE séparé ;
2. créer un checkout LIVE séparé non encore publié ;
3. effectuer un unique achat réel contrôlé ;
4. vérifier Lemon → webhook signé → Airtable → Digify → `/merci` → `Lire mon guide` ;
5. effectuer un remboursement réel contrôlé ;
6. vérifier la révocation Digify ;
7. corriger toute anomalie avant ouverture publique.

## Phase 13 — Passage public

Ne publier le checkout sur le site qu'après tous les contrôles précédents et une autorisation explicite de lancement.

Préconditions :

- PDF final V1 ;
- validation humaine du livre ;
- fichier Digify final et test de révocation réussi ;
- domaine `d4d5d6.com` vérifié ;
- juridique validé ;
- payout/store Lemon confirmé ;
- webhook live séparé ;
- checkout live séparé ;
- achat/remboursement live contrôlé.

Seulement alors : `commerce_launch_authorized=true` et publication du checkout LIVE sur le site.
