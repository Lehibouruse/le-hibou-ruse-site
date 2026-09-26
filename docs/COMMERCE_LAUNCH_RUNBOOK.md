# Le Hibou Rusé — lancement paiement → lecture sécurisée

## État cible

Un achat live à 29 € doit suivre cette chaîne :

Lemon Squeezy checkout → webhook signé `order_created` → vente Airtable → statut `reader_ready` → `/merci?order=[order_identifier]` → lien signé vers `/lire?token=...` → lecteur Hibou protégé.

Le redirect Lemon n'est jamais une preuve de paiement. Seul le webhook signé peut créer une vente éligible.

Le PDF maître ne doit jamais être joint au variant Lemon public, exposé par une URL publique ou renvoyé directement au navigateur. Lemon est le prestataire de paiement, pas le canal de livraison du fichier.

## Provider de livraison

Configuration cible :

- `commerce_delivery_provider=hibou_reader`
- `commerce_launch_authorized=false` jusqu'au test live contrôlé réussi
- `lemon_downloadable_file_removed_verified=false` tant qu'un fichier téléchargeable est encore attaché au variant LIVE

Digify reste un fallback historique désactivé. Ne souscrire à aucun abonnement Digify sans décision explicite.

## Lecteur Hibou V1

Le lecteur `/lire` :

1. exige un jeton signé HMAC généré uniquement après une vente reconnue ;
2. revérifie la vente dans Airtable à chaque ouverture ;
3. refuse immédiatement une commande remboursée/révoquée ;
4. exige `Livraison statut=reader_ready` ;
5. ne renvoie aucun PDF ou URL de téléchargement ;
6. affiche le livre en ligne avec watermark nominatif ;
7. désactive les interactions ordinaires de sélection, copier/coller, clic droit, glisser-déposer, impression et raccourcis de sauvegarde ;
8. utilise `no-store`, `noindex`, CSP et protection contre l'embarquement dans une iframe.

Cette protection réduit fortement la copie ordinaire mais ne doit jamais être décrite comme impossible à contourner : un navigateur contrôlé par le lecteur peut toujours être instrumenté et un écran peut être photographié.

### Renforcement cible avant diffusion large

Pour supprimer également la couche texte du navigateur, la V2 doit rasteriser l'édition finale page par page et conserver les images dans un stockage privé (par exemple Vercel Blob privé). Le lecteur authentifié servira alors les pages comme images temporaires avec watermark, sans exposer le PDF maître ni une couche texte directement sélectionnable.

## Lemon Squeezy

Avant ouverture publique :

1. le store LIVE, le produit et le variant à 29 € doivent être valides ;
2. le webhook LIVE doit pointer vers `https://d4d5d6.com/api/commerce/lemon-webhook` avec `order_created` et `order_refunded` ;
3. la confirmation et le reçu doivent renvoyer vers `https://d4d5d6.com/merci?order=[order_identifier]` ;
4. **aucun fichier PDF téléchargeable ne doit rester attaché au variant LIVE** ;
5. un audit API doit confirmer `variant_file_count=0` avant de passer `lemon_downloadable_file_removed_verified=true` ;
6. le payout/store doit être prêt ;
7. le checkout ne doit pas être ouvert tant que le kill switch est à `false`.

## Livre

Avant le premier achat réel :

1. finaliser l'édition et la sortir de tout état `draft` ;
2. terminer les validations humaines et QC requises ;
3. vérifier le rendu dans le lecteur Hibou sur desktop et mobile ;
4. conserver le PDF maître uniquement comme source privée/archivée ;
5. ne pas joindre le PDF maître au produit Lemon.

## Remboursement / révocation

Un événement signé `order_refunded` met la vente en état remboursé/révoqué. Le lecteur revérifie la vente à chaque requête : un ancien lien signé ne suffit donc pas à conserver l'accès après remboursement.

## Test live contrôlé

Cette étape nécessite une autorisation humaine explicite car elle crée une transaction réelle.

1. Laisser `commerce_launch_authorized=false` pendant toute la préparation.
2. Prouver par audit que le variant Lemon contient zéro fichier téléchargeable.
3. Vérifier lecteur, webhook, domaine, payout et édition.
4. Passer temporairement `commerce_launch_authorized=true`.
5. Effectuer un seul achat contrôlé à 29 €.
6. Vérifier : vente Airtable unique, statut `reader_ready`, page `/merci`, bouton **Lire mon guide**, ouverture du lecteur, absence de PDF/download, protections de copie/impression.
7. Tester ensuite le remboursement et vérifier que le même lien lecteur est refusé.
8. Repasser immédiatement `commerce_launch_authorized=false` si un contrôle échoue.

## Règle de sécurité

Aucune ouverture publique si l'un des points suivants n'est pas prouvé :

- fichier téléchargeable Lemon retiré ;
- paiement/webhook signé fonctionnel ;
- édition non draft ;
- lecteur signé fonctionnel ;
- remboursement révocatoire fonctionnel ;
- contrôles juridiques requis selon le mode de lancement.

Le système doit échouer fermé plutôt que livrer le PDF brut.
