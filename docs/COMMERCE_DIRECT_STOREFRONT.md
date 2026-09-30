# Commande directe depuis la vitrine Lemon

La vitrine Lemon peut proposer un achat sans passer par `/achat-guide`. Le webhook reçoit alors l'identifiant UUID natif de la commande (`attributes.identifier`), mais aucune preuve de consentement `DIGITAL_SUPPLY_V1` dans `meta.custom_data`. Le code enregistre la vente dans Airtable avec `Livraison statut = manual_review` et ne crée pas d'accès au lecteur. Il ne faut jamais inventer ou cocher une preuve de consentement après coup.

## Avant l'ouverture du site

Dans le compte propriétaire Lemon, désactiver **Display product on storefront?** pour ce produit tout en gardant son checkout partageable. Vérifier en navigation publique que la vitrine ne permet plus l'achat direct, puis utiliser exclusivement le lien de checkout créé après les deux consentements sur `/achat-guide`. [Documentation Lemon sur la visibilité des produits](https://docs.lemonsqueezy.com/help/products/adding-products).

## Si une commande directe arrive malgré tout

1. Retrouver l'ordre par son `ID commande externe`, son UUID public et l'e-mail dans Lemon et dans la table Airtable **Ventes**. Vérifier son statut réel de paiement et l'absence de remboursement.
2. Garder `manual_review` : aucune livraison automatique et aucune renonciation au droit de rétractation ne sont présumées. Prévenir l'acheteur que l'accès n'a pas été créé et proposer la solution prévue par le support. En l'absence d'un parcours de livraison directe validé avec les droits applicables, effectuer le remboursement dans Lemon et vérifier l'événement `order_refunded` puis la révocation côté Hibou.
3. Ne jamais modifier `commerce_launch_authorized`, `Livraison statut` ou la preuve de consentement pour « réparer » cette commande sans vérification du paiement, du destinataire et de la solution retenue.

Le webhook ne rend `reader_ready` que lorsque le lancement, le parcours LIVE, la confirmation durable et le test de bout en bout sont validés, que le produit/variant est connu, que l'édition possède du texte et que `meta.custom_data` porte une preuve de consentement valide. [Structure officielle des webhooks Lemon](https://docs.lemonsqueezy.com/help/webhooks/webhook-requests).
