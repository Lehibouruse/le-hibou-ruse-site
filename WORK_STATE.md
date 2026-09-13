# Le Hibou Rusé — état de reprise

Dernière mise à jour : 2026-09-13 UTC

## Terminé dans cette reprise

- Intégration OpenAI API publiée sur `main` : endpoint serveur `POST /api/analyze-montage` utilisant la Responses API, prompt Hibou Rusé D1-D6 et sortie JSON stricte (mécanisme, fondement, gain, conditions, risques, vérifications, variante robuste et score D).
- Clé API créée dans le projet OpenAI sélectionné et stockée sans exposition dans `OPENAI_API_KEY` sur Vercel pour Production, Preview et Development. Le modèle est configurable par `OPENAI_MODEL` et utilise `gpt-5.6-luna` par défaut.
- Table Airtable `Montages` existante conservée et enrichie des champs d'analyse. L'endpoint utilise une clé SHA-256 du montage et du contexte pour mettre à jour un résultat existant au lieu de créer un doublon.
- Build Next.js réussi. Déploiement Production Vercel `Ready` après le commit GitHub `4b91f87cd39db53dafa039810d7e7455b1bafb92`.
- Test bout en bout contrôlé réussi sur `https://le-hibou-ruse-site.vercel.app/api/analyze-montage` : réponse OpenAI structurée, écriture Airtable `recRFh6EN4PKDNBOH`, puis second appel sur le même cas avec `deduplicated: true` et le même record.
- V3 publiée sur `main` au commit GitHub `72efbfd804e19ed04119d619ceef56efd31ae881`; déploiement Vercel Production `Ready` et domaine public contrôlé en HTTP et dans un navigateur réel.
- Checkout GitHub repris depuis `main` (`54948c5`). Le commit local V3 annoncé (`41f7476`) n'était présent ni dans le workspace ni dans les références distantes.
- Ancien checkout Stripe de test supprimé de `Produits site` dans Airtable.
- V3 reconstruite : interface premium responsive, logo SVG stable, D4/D5/D6, e-book à 29 €, CTA désactivé sans vrai checkout, formulaire Montage personnalisé, analytics Vercel et lecture CMS/Articles/Produits/Configuration depuis Airtable.
- Le formulaire écrit côté serveur dans `Demandes montage`; aucun secret n'est envoyé au navigateur.
- Test réel Airtable → production réussi : publication/mise en avant de l'article test détectée sans commit, puis données remises à l'état final non publié.
- Test réel Produits → production réussi : le checkout Stripe de test a disparu après rafraîchissement ISR.
- Jeton Airtable Vercel existant conservé et limité à la seule base média; ajout du scope minimal `data.records:write` à côté de `data.records:read`.
- Test réel formulaire production → API Vercel → `Demandes montage` réussi (`recU9q91PY5K7pYxe`, marqué « Test validé »).
- Infrastructure Lemon Squeezy codée : webhook HMAC, upsert idempotent dans `Ventes`, remboursement, journalisation, page `/merci`; aucun PDF payant dans `public/`.
- Endpoint authentifié `/api/health` codé pour tester site, Airtable, Jobs et journal.

## À vérifier / prochaine action exacte

1. Brancher une interface ou un Job à `POST /api/analyze-montage` lorsque l'analyse doit être exposée dans le produit; l'API et la persistance sont déjà opérationnelles.
2. Terminer la création du compte Lemon Squeezy via Google (écran d'inscription), puis créer boutique/produit 29 €, fichier, checkout, reçus et webhook de test.
3. Définir sans l'exposer `LEMON_SQUEEZY_WEBHOOK_SECRET` dans Vercel.
4. Brancher Pipedream sur `/api/orchestrator` et `/api/health` (Vercel Hobby ne permet qu'un cron quotidien).
5. Compléter les champs normalisés de `Content Pipeline`, puis construire le MVP Remotion.

## Jobs / orchestrateur

- Table `Jobs` créée (`tblRLb9bWBzpBnD20`) avec états, retries, revue humaine et clé d'idempotence.
- Écriture ChatGPT → Jobs confirmée par le job `bootstrap-20260912-001`.
- Endpoint `/api/orchestrator` codé : `UPDATE_SITE`, `UPDATE_CHECKOUT`, `CREATE_ARTICLE`, `PUBLISH_ARTICLE`, journalisation, déduplication et 2 retries par défaut.
- Déclencheur périodique externe à brancher après ajout de `CRON_SECRET`; `/api/health` est prêt dans le même modèle d'authentification.

## Blocage actuel

- Le connecteur GitHub permet les commits et mises à jour de `main`; les identifiants HTTPS GitHub ne sont pas disponibles au terminal, donc les mises à jour distantes passent par le connecteur.
- Lemon Squeezy demande encore la création explicite du compte Google de marque et l'acceptation de ses conditions; KYC et coordonnées bancaires resteront une action humaine.

## Paiement

- `Configuration.checkout_url` est vide : le compte Lemon Squeezy n'est pas encore entièrement créé.
- Le webhook prévu est `https://le-hibou-ruse-site.vercel.app/api/webhooks/lemonsqueezy` pour `order_created` et `order_refunded`.
- Tant que cette valeur est vide, tous les CTA d'achat sont volontairement désactivés.

## Variables Vercel

- `OPENAI_API_KEY` existe comme secret Vercel pour Production, Preview et Development; aucune valeur n'a été lue ou exposée.
- `OPENAI_MODEL` est optionnelle; l'endpoint utilise `gpt-5.6-luna` par défaut.
- `AIRTABLE_TOKEN` existe comme variable partagée Vercel pour tous les environnements; aucune valeur n'a été lue ou exposée.
- Le token a maintenant les scopes `data.records:read` et `data.records:write` sur `appWyUX7TYPNrDbyP` uniquement.
- `CRON_SECRET` manque encore et doit être créé avant d'activer le déclencheur périodique.
- `LEMON_SQUEEZY_WEBHOOK_SECRET` manque jusqu'à la création du webhook Lemon Squeezy.
- Vercel Web Analytics est actif et affiche déjà des données.

## Garde-fous

- Ne pas publier les premières vidéos sans validation humaine.
- Ne jamais enregistrer de token, clé ou mot de passe dans Airtable ou GitHub.

