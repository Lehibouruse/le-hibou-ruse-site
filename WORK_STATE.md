# Le Hibou Rusé — état de reprise

Dernière mise à jour : 2026-09-12 UTC

## Terminé dans cette reprise

- Checkout GitHub repris depuis `main` (`54948c5`). Le commit local V3 annoncé (`41f7476`) n'était présent ni dans le workspace ni dans les références distantes.
- Ancien checkout Stripe de test supprimé de `Produits site` dans Airtable.
- V3 reconstruite : interface premium responsive, logo SVG stable, D4/D5/D6, e-book à 29 €, CTA désactivé sans vrai checkout, formulaire Montage personnalisé, analytics Vercel et lecture CMS/Articles/Produits/Configuration depuis Airtable.
- Le formulaire écrit côté serveur dans `Demandes montage`; aucun secret n'est envoyé au navigateur.
- Test réel Airtable → production réussi : publication/mise en avant de l'article test détectée sans commit, puis données remises à l'état final non publié.
- Test réel Produits → production réussi : le checkout Stripe de test a disparu après rafraîchissement ISR.

## À vérifier / prochaine action exacte

1. Installer les dépendances, lancer `npm run build`, corriger les erreurs éventuelles.
2. Le commit local « Publish Airtable-driven V3 and job orchestrator » est prêt. Connecter l'authentification GitHub au terminal/plugin, pousser sur `main`, puis vérifier le déploiement Vercel desktop/mobile.
3. Vérifier après déploiement V3 qu'il reçoit bien la variable partagée `AIRTABLE_TOKEN` (elle existe pour tous les environnements et la production actuelle l'utilise déjà).
4. Tester en production CMS, Articles, Produits, CTA et formulaire puis remettre les données finales.
5. Définir `CRON_SECRET`, puis appeler `/api/orchestrator` depuis Pipedream ou un cron Vercel.

## Jobs / orchestrateur

- Table `Jobs` créée (`tblRLb9bWBzpBnD20`) avec états, retries, revue humaine et clé d'idempotence.
- Écriture ChatGPT → Jobs confirmée par le job `bootstrap-20260912-001`.
- Endpoint `/api/orchestrator` codé : `UPDATE_SITE`, `UPDATE_CHECKOUT`, `CREATE_ARTICLE`, `PUBLISH_ARTICLE`, journalisation, déduplication et 2 retries par défaut.
- Déclencheur périodique externe à brancher après ajout de `CRON_SECRET`.

## Blocage actuel

- `git push origin main` échoue avec « could not read Username for https://github.com » : le dépôt est lisible, mais la connexion GitHub annoncée n'est pas exposée au terminal de cette session.

## Paiement

- `Configuration.checkout_url` est vide : Lemon Squeezy/KYC restent à configurer.
- Tant que cette valeur est vide, tous les CTA d'achat sont volontairement désactivés.

## Variables Vercel

- `AIRTABLE_TOKEN` existe comme variable partagée Vercel pour tous les environnements; aucune valeur n'a été lue ou exposée.
- `CRON_SECRET` manque encore et doit être créé avant d'activer le déclencheur périodique.
- Vercel Web Analytics est actif et affiche déjà des données.

## Garde-fous

- Ne pas publier les premières vidéos sans validation humaine.
- Ne jamais enregistrer de token, clé ou mot de passe dans Airtable ou GitHub.
