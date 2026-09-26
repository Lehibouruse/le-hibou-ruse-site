# Le Hibou Rusé — lancement paiement → lecture

## État cible

Un achat live à 29 € doit suivre cette chaîne :

Lemon Squeezy checkout → webhook signé `order_created` → vente Airtable → provider de livraison sélectionné → `/merci?order=[order_identifier]`.

Deux providers sont supportés :
- `digify` : accès nominatif protégé, révocable et suivi par le worker Digify ;
- `lemon_native` : fichier attaché au variant LIVE, accès via le reçu Lemon / **My Orders**, sans abonnement Digify. Ce mode reste fail-closed tant que `lemon_native_delivery_verified=true` n'a pas été explicitement établi.

Le redirect Lemon n'est jamais une preuve de paiement. Seul le webhook signé peut créer une vente éligible côté Hibou.

## Lemon Squeezy — à faire après validation KYC/store

1. Créer/activer le produit live **Ebook Le Hibou Rusé** à 29 €.
2. Renseigner dans Airtable `Produits site` :
   - `Lemon Squeezy Product ID`
   - `Lemon Squeezy Variant ID`
   - `Lemon Squeezy Checkout URL`
3. Renseigner `Configuration.checkout_url` avec l'URL live uniquement au moment de l'ouverture publique, pas pendant le test live contrôlé.
4. Configurer le redirect de confirmation et le bouton du reçu vers :
   `https://d4d5d6.com/merci?order=[order_identifier]`
5. Créer le webhook live vers :
   `https://d4d5d6.com/api/commerce/lemon-webhook`
6. Événements minimum : `order_created`, `order_refunded`.
7. Stocker le signing secret uniquement dans `LEMON_SQUEEZY_WEBHOOK_SECRET` côté Vercel.
8. Vérifier que le webhook est live, pas test mode.

## Livre / livraison

### Option A — Digify

1. Tous les chapitres : validation humaine = true, QC non fail, prêt export = true.
2. Remplacer `book_current_edition` par une édition finale sans `draft`.
3. Exporter le PDF final puis l'importer dans Digify.
4. Appliquer la politique : accès nominatif, téléchargement/impression désactivés par défaut, watermark email + date/heure, révocation possible.
5. Renseigner `Digify File GUID` dans le produit Airtable.
6. Configurer côté serveur :
   - `DIGIFY_KEY_ID`
   - `DIGIFY_SECRET`
   - `DIGIFY_ADD_RECIPIENT_URL`
   - `DIGIFY_ADD_RECIPIENT_BODY_TEMPLATE`
   - `DIGIFY_REVOKE_RECIPIENT_URL`
   - `DIGIFY_REVOKE_RECIPIENT_BODY_TEMPLATE`
   - `DIGIFY_WEBHOOK_USERNAME`
   - `DIGIFY_WEBHOOK_PASSWORD`
7. Configurer le webhook d'activité Digify vers `https://d4d5d6.com/api/commerce/digify-webhook` avec la Basic Auth dédiée ci-dessus. Ne jamais réutiliser les credentials API Digify pour ce webhook.
8. Activer la notification Digify au destinataire comme secours à la page post-achat.
9. Vérifier qu'un événement `View` est rattaché au bon email et qu'un éventuel `Print`/`Download` remonte comme **Policy Alert**, puisque ces actions doivent rester désactivées.


### Option B — Lemon natif

1. Le PDF exact de l'édition vendue doit être attaché au **variant LIVE** Lemon et avoir le statut `published`, `test_mode=false`.
2. Confirmer par API que le Store/Product/Variant correspondent aux IDs configurés et que `native_file_delivery_ready=true`.
3. Effectuer au moins une validation contrôlée de l'accès client via le reçu et `https://app.lemonsqueezy.com/my-orders` avant de passer `lemon_native_delivery_verified=true`.
4. Basculer `delivery_provider_mode=lemon_native` uniquement après cette validation humaine ; ne pas modifier automatiquement ce champ à l'expiration de Digify.
5. Limite assumée : ce mode fournit un **PDF téléchargeable** ; il n'offre pas les contrôles Digify de viewer, watermark dynamique, blocage impression/téléchargement ni révocation API nominative.
6. Après remboursement, le site Hibou marque l'accès comme révoqué mais ne prétend pas révoquer lui-même un fichier déjà disponible dans l'écosystème Lemon.

## Domaine et juridique

Avant ouverture publique :
- `d4d5d6.com` doit être le domaine canonique réellement vérifié ;
- CGV, mentions légales, confidentialité/cookies et avertissement éditorial doivent être `Validé` ;
- `commerce_readiness_mode=strict` reste actif.

## Tests avant ouverture

### 1. Tests sandbox / test mode

1. Laisser `commerce_launch_authorized=false`.
2. Tester Lemon en `test_mode=true` et Digify séparément avec un destinataire de test.
3. Une commande Lemon de test ne doit jamais provoquer une livraison ou une révocation Digify réelle.
4. Le checkout de test ne doit jamais être utilisé comme `checkout_url` public.
5. Vérifier le webhook d'activité Digify avec la Basic Auth dédiée avant toute phase live ; aucun événement sans email destinataire ne doit être rattaché à une vente.

### 2. Achat live contrôlé de bout en bout

Cette phase n'a lieu qu'après validation de toutes les autres dépendances live.

1. Créer/configurer le checkout et le webhook live dans Lemon, mais **ne pas renseigner `Configuration.checkout_url` et ne pas publier le checkout sur le site**.
2. Vérifier que le PDF final, le File GUID, les endpoints Digify officiels, le webhook d'activité Digify, le domaine, le juridique et le payout/store sont prêts.
3. Ouvrir une fenêtre de validation courte en passant explicitement `commerce_launch_authorized=true`.
4. Accéder manuellement au checkout live privé depuis Lemon et effectuer un seul achat contrôlé à 29 €.
5. Vérifier : vente Airtable unique, webhook signé, livraison Digify nominative, bouton `Lire mon guide`, email Digify, attribution et absence de doublon.
6. Refermer immédiatement la fenêtre en remettant `commerce_launch_authorized=false` après confirmation de la livraison.
7. Effectuer ensuite le remboursement contrôlé et vérifier la révocation Digify ; la révocation doit fonctionner même avec le lancement public refermé.
8. Si un contrôle échoue, conserver le switch à `false`, ne pas publier le checkout et corriger avant tout nouveau test.

### 3. Ouverture publique ultérieure

Seulement après le test live contrôlé réussi et la revue finale :

1. renseigner `Configuration.checkout_url` avec le checkout LIVE validé ;
2. vérifier à nouveau tous les contrôles stricts ;
3. passer explicitement `commerce_launch_authorized=true` pour l'ouverture publique ;
4. vérifier que le bouton public du site pointe bien vers le checkout LIVE attendu.

## Règle de sécurité

Ne jamais exposer le PDF maître ni utiliser le redirect Lemon comme preuve de paiement. La page `/merci` ne révèle un lien Digify qu'après qu'une vente créée par le webhook signé soit réellement marquée `delivered`.
