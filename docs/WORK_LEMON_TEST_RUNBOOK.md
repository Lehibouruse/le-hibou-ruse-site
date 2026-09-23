# Work — Lemon Squeezy TEST + Digify — runbook canonique

Mise à jour : 23/09/2026.

## État actuel

Le parcours **LIVE** et le parcours **TEST** sont deux systèmes distincts.

LIVE déjà configuré :
- Store : `475333`
- Product : `1369573`
- Variant : `2140119`
- prix : 29 €
- checkout LIVE déjà référencé/publié pour l'early-access ;
- webhook LIVE `order_created` / `order_refunded` câblé ;
- Digify Production : authentification, add recipient, Quick Access Link et remove recipient déjà testés historiquement ;
- `commerce_launch_authorized=true` correspond à une autorisation humaine antérieure de vendre l'édition partielle annoncée ;
- aucun test demandé dans ce document ne doit créer un achat réel.

TEST encore incomplet :
- une clé API **Test** Lemon dédiée reste à fournir ;
- Store/Product/Variant TEST doivent être retrouvés ou créés dans l'environnement Test et prouvés avec `test_mode=true` ;
- checkout TEST et webhook TEST doivent ensuite être vérifiés.

## Garde-fous

- `lemon_test_mode_only=TRUE`.
- Le workflow TEST n'accepte que `inspect`, `checkout_test`, `webhook_test`.
- La route `/api/commerce/lemon-bootstrap` lit **uniquement** `LEMON_SQUEEZY_TEST_API_KEY` pour ces actions.
- La clé LIVE `LEMON_SQUEEZY_API_KEY` n'est jamais un fallback du parcours TEST.
- Les tests unitaires vérifient cette séparation.
- Aucun achat réel, remboursement réel, changement de plan, abonnement ou dépense ne doit être déclenché par l'automatisation.
- Aucun secret dans Airtable, Git, logs ou chat.
- Une commande Lemon avec `test_mode=true` ne doit jamais provoquer un ajout ou retrait de destinataire Digify réel.
- Fourniture immédiate et rétractation sont deux parcours juridiques/techniques distincts.

## Action humaine minimale restante

Dans Lemon Squeezy **mode Test** :

1. créer ou retrouver une clé API Test dédiée ;
2. la saisir directement dans Vercel, Production server-side, sous :
   `LEMON_SQUEEZY_TEST_API_KEY`
3. ne pas remplacer `LEMON_SQUEEZY_API_KEY` ;
4. ne pas partager la valeur de la clé dans le chat.

Cette action débloque le reste du parcours automatisable.

## Étape A — inspect

GitHub Actions → **Hibou Lemon Commerce Test** → `inspect`.

La route doit :
- refuser de fonctionner si `LEMON_SQUEEZY_TEST_API_KEY` est absente ;
- vérifier `lemon_test_mode_only=TRUE` ;
- interroger Lemon avec la clé Test uniquement ;
- sélectionner un Store sans ambiguïté ;
- retrouver le produit exact ;
- retrouver un variant paiement unique à 2 900 centimes ;
- exiger `product.attributes.test_mode=true` ;
- exiger `variant.attributes.test_mode=true` ;
- enregistrer seulement les identifiants TEST :
  - `lemon_test_store_id`
  - `lemon_test_product_id`
  - `lemon_test_variant_id`
  - `lemon_test_api_status=CONNECTED_TEST_ONLY`.

Si plusieurs stores/produits/variants sont ambigus, arrêter sans deviner.

## Étape B — checkout_test

Lancer le même workflow avec `checkout_test`.

Attendu :
- checkout `test_mode=true` uniquement ;
- variant TEST exact à 29 € ;
- locale française ;
- URL HTTPS Lemon ;
- redirection vers le site Hibou avec `[order_identifier]` ;
- aucune publication du checkout TEST dans le champ LIVE ;
- si un checkout TEST est déjà stocké, le relire d'abord chez Lemon et le réutiliser uniquement si Store, Variant et `test_mode=true` correspondent.

Stockage autorisé :
- `lemon_test_checkout_id`
- `lemon_test_checkout_url`.

## Étape C — webhook_test

Lancer `webhook_test`.

Attendu :
- webhook `test_mode=true` ;
- endpoint TEST Hibou configuré ;
- événements `order_created` et `order_refunded` ;
- réutilisation d'un webhook identique si présent ;
- arrêt si le même endpoint existe avec une configuration incompatible ;
- aucun secret de signature stocké dans Airtable.

## Étape D — commande de test Lemon

Uniquement après A–C réussies :

1. ouvrir le checkout TEST ;
2. utiliser exclusivement les moyens de paiement de test Lemon ;
3. vérifier `order_created` ;
4. vérifier une ligne Ventes unique/dédupliquée ;
5. vérifier que `test_mode=true` force la livraison en état bloqué / revue et **n'appelle pas Digify** ;
6. vérifier que `/merci` ne révèle pas de lien Digify pour cette commande TEST ;
7. utiliser ensuite la fonction de remboursement de test Lemon si nécessaire pour vérifier l'ordre des événements et la déduplication, sans effet Digify réel.

Aucune carte ou transaction réelle.

## Étape E — Digify, séparément

Le test Digify ne dépend pas d'une fausse commande Lemon.

État déjà prouvé historiquement :
- credentials Production valides ;
- File GUID cohérent avec Airtable ;
- ajout de destinataire réussi ;
- Quick Access Link retourné ;
- suppression/révocation réussie.

À ne pas refaire sans raison :
- installation de l'API ;
- création de nouvelles clés ;
- ajout/suppression de destinataires réels juste pour « revérifier ».

À refaire uniquement lorsque :
- l'édition commerciale change ;
- le File GUID change ;
- le fournisseur de livraison change ;
- une régression est détectée.


## Authentification du webhook d'activité Digify

Le webhook d'activité Digify reste un canal distinct des credentials API d'ajout/retrait de destinataire.

Endpoint canonique : `https://d4d5d6.com/api/commerce/digify-webhook` (route `/api/commerce/digify-webhook`).

Variables serveur attendues :
- `DIGIFY_WEBHOOK_USERNAME`
- `DIGIFY_WEBHOOK_PASSWORD`

Elles doivent être configurées ensemble et rester secrètes. Lorsque l'implémentation dérive ces valeurs depuis un secret serveur selon le mécanisme prévu par le runtime, la readiness peut accepter cette source dérivée sans exposer la valeur. Le webhook continue de n'accepter que les événements prévus et de rattacher les événements nominatifs au destinataire concerné.

## Sécurité webhook / livraison

Le webhook Lemon :
- vérifie la signature HMAC ;
- déduplique par commande ;
- gère un remboursement arrivé avant `order_created` ;
- ne réactive jamais une livraison déjà remboursée ;
- bloque toute commande `test_mode=true` avant Digify ;
- bloque la livraison si le consentement de fourniture immédiate est absent/invalide ;
- fige l'édition et le File GUID utilisés pour la vente.

La file commerce :
- traite livraison et révocation séparément ;
- utilise un lease/idempotency guard ;
- limite les retries ;
- bascule en revue manuelle si l'état externe devient ambigu ;
- n'utilise jamais l'ancien agent OpenAI.

## Fourniture immédiate ≠ rétractation

Deux preuves distinctes doivent rester séparées :

1. **Fourniture immédiate de contenu numérique**
   - consentement exprès avant fourniture ;
   - accusé de la perte du droit de rétractation lorsque les conditions légales applicables sont réunies ;
   - preuve durable associée à la commande.

2. **Demande de rétractation**
   - route/formulaire séparé ;
   - accusé de réception distinct ;
   - son existence ne prouve pas le consentement préalable à la fourniture immédiate.

Ne jamais cocher l'une sur la seule preuve de l'autre.

## Ce qui n'est pas une preuve

- présence d'un bouton ;
- existence d'une route ;
- clé LIVE fonctionnelle ;
- produit LIVE à 29 € ;
- ancien test Digify ;
- simple ligne Airtable.

La preuve TEST finale est : clé Test dédiée + ressources Test confirmées `test_mode=true` + checkout TEST + webhook TEST + commande TEST dédupliquée sans effet Digify.

## Passage LIVE

Le LIVE existe déjà en early-access. Ce runbook ne doit donc pas recréer le Store/Product/Variant LIVE ni modifier le checkout public.

Tout changement de :
- produit vendu ;
- édition livrée ;
- fournisseur de livraison ;
- prix ;
- statut public du checkout ;
- politique de remboursement/rétractation ;

doit faire l'objet d'une validation humaine distincte.
