# Le Hibou Rusé — lancement paiement → lecture

## État cible

Un achat live à 29 € doit suivre cette chaîne :

Lemon Squeezy checkout → webhook signé `order_created` → vente Airtable → livraison Digify nominative → `/merci?order=[order_identifier]` → bouton **Lire mon guide** → révocation Digify si `order_refunded`.

Le redirect Lemon n'est jamais une preuve de paiement. Seul le webhook signé peut créer une vente éligible.

## Lemon Squeezy — à faire après validation KYC/store

1. Créer/activer le produit live **Ebook Le Hibou Rusé** à 29 €.
2. Renseigner dans Airtable `Produits site` :
   - `Lemon Squeezy Product ID`
   - `Lemon Squeezy Variant ID`
   - `Lemon Squeezy Checkout URL`
3. Renseigner `Configuration.checkout_url` avec l'URL live.
4. Configurer le redirect de confirmation et le bouton du reçu vers :
   `https://d4d5d6.com/merci?order=[order_identifier]`
5. Créer le webhook live vers :
   `https://d4d5d6.com/api/commerce/lemon-webhook`
6. Événements minimum : `order_created`, `order_refunded`.
7. Stocker le signing secret uniquement dans `LEMON_SQUEEZY_WEBHOOK_SECRET` côté Vercel.
8. Vérifier que le webhook est live, pas test mode.

## Livre / Digify

1. Tous les chapitres : validation humaine = true, QC non fail, prêt export = true.
2. Remplacer `book_current_edition` par une édition finale sans `draft`.
3. Exporter le PDF final puis l'importer dans Digify.
4. Appliquer la politique : accès nominatif, téléchargement/impression désactivés par défaut, watermark email + date/heure, révocation possible.
5. Renseigner `Digify File GUID` dans le produit Airtable.
6. Configurer côté serveur :
   - `DIGIFY_KEY_ID`
   - `DIGIFY_SECRET`
   - `DIGIFY_ADD_RECIPIENT_BODY_TEMPLATE`
   - endpoint/template de révocation si disponible
7. Activer la notification Digify au destinataire comme secours à la page post-achat.

## Domaine et juridique

Avant ouverture publique :
- `d4d5d6.com` doit être le domaine canonique réellement vérifié ;
- CGV, mentions légales, confidentialité/cookies et avertissement éditorial doivent être `Validé` ;
- `commerce_readiness_mode=strict` reste actif.

## Test de lancement

1. Laisser `commerce_launch_authorized=false`.
2. Tester les webhooks en mode test : aucune livraison réelle ne doit partir.
3. Une fois toutes les dépendances live, effectuer un achat réel contrôlé à 29 €.
4. Vérifier : vente Airtable, accès Digify, bouton `Lire mon guide`, email Digify, attribution, absence de doublon.
5. Effectuer ensuite un remboursement contrôlé et vérifier la révocation.
6. Seulement après ces tests, passer `commerce_launch_authorized=true`.

## Règle de sécurité

Ne jamais exposer le PDF maître ni utiliser le redirect Lemon comme preuve de paiement. La page `/merci` ne révèle un lien Digify qu'après qu'une vente créée par le webhook signé soit réellement marquée `delivered`.
