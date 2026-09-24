# Le Hibou Rusé

Site éditorial piloté par Airtable, avec file de jobs, orchestration idempotente et synchronisation du commerce Lemon Squeezy.

## Endpoints opérationnels

- `POST /api/leads` : demandes de montage vers Airtable.
- `GET /api/orchestrator` : traite le prochain job avec `Authorization: Bearer $CRON_SECRET`.
- `GET /api/health` : contrôle authentifié site/Airtable/jobs.
- `POST /api/commerce/lemon-webhook` : vérifie les webhooks Lemon Squeezy et synchronise les commandes/remboursements dans Airtable.
- `POST /api/commerce/digify-readiness` : contrôle sans effet externe la préparation de l'intégration Digify.

Lemon Squeezy est la couche Merchant of Record. Digify est la couche prévue pour la livraison nominative et protégée des fichiers numériques. Aucun PDF payant n'est placé dans `public/`.

Site connecté à Airtable.


## Reprise du projet

- État canonique courant : `WORK_STATE.md`
- Index documentaire : `docs/README.md`

Ne pas confondre code présent, runtime configuré, test réel réussi et production autorisée.
