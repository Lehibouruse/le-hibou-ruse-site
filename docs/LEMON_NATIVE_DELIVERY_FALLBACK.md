# Fallback livraison Lemon native — préparation, pas activation

Date : 23/09/2026.

## Pourquoi ce fallback existe

Digify apporte un contrôle nominatif, des restrictions de téléchargement/impression, un watermark et une révocation par destinataire, mais son essai gratuit arrive à échéance et son prix public Pro actuel est élevé au regard de l'objectif économique initial du Hibou.

Lemon Squeezy peut déjà héberger les fichiers attachés à un produit/variant et les rendre accessibles à l'acheteur depuis son reçu et **My Orders**. Les URL de fichier renvoyées par l'API sont signées, expirent après une heure et sont limitées à 10 téléchargements par jour et par adresse IP.

Ce fallback ne prétend pas reproduire Digify.

## État actuel

- `delivery_provider_mode=digify`.
- `lemon_native_delivery_verified=false`.
- Aucun basculement automatique à l'expiration de Digify.
- Aucun abonnement n'est souscrit.
- Aucun fichier commercial n'est remplacé ou attaché automatiquement.

## Conditions avant activation éventuelle

Avant de passer `delivery_provider_mode=lemon_native`, il faut prouver :

1. le variant LIVE exact est bien celui vendu ;
2. le fichier joint est exactement l'édition commerciale approuvée ;
3. le fichier Lemon est publié et accessible depuis un achat de test/contrôlé conforme ;
4. la page My Orders/reçu permet bien l'accès attendu ;
5. Marc accepte explicitement la perte des contrôles spécifiques Digify ;
6. le comportement de l'accès après remboursement est vérifié séparément.

Tant que ces six points ne sont pas acquis, `lemon_native_delivery_verified` reste `false`.

## Comportement du code

La route de livraison :
- utilise Digify par défaut ;
- refuse un provider inconnu ;
- refuse Lemon natif si le garde-fou de vérification est faux ;
- conserve les contrôles doublons/remboursement et édition finale avant de marquer une livraison ;
- n'appelle jamais Digify dans la branche Lemon native ;
- journalise que la remise du contenu est assurée par le reçu/My Orders ;
- expose explicitement les limitations `no_digify_watermark` et `no_proven_individual_refund_revocation`.

Le site Hibou continue de considérer un remboursement comme révoqué dans son propre endpoint d'accès. Cela ne constitue pas une preuve que Lemon supprime lui-même l'accès au fichier après remboursement.

## Références officielles

Documentation Lemon Squeezy consultée le 23/09/2026 :
- My Orders : accès par magic link aux achats et fichiers actuellement disponibles ;
- Product Files : fichiers attachables aux produits/variants ;
- File API : URL signée, expiration une heure, limite de 10 téléchargements/jour/IP ;
- webhooks : `order_created` et `order_refunded`.

Le fallback doit rester une option de continuité économique, pas une dégradation silencieuse du niveau de protection.
