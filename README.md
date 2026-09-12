# Le Hibou Rusé

Site éditorial piloté par Airtable, avec file de jobs, orchestration idempotente et synchronisation des ventes Lemon Squeezy.

## Endpoints opérationnels

- `POST /api/leads` : demandes de montage vers Airtable.
- `GET /api/orchestrator` : traite le prochain job avec `Authorization: Bearer $CRON_SECRET`.
- `GET /api/health` : contrôle authentifié site/Airtable/jobs.
- `POST /api/webhooks/lemonsqueezy` : vérifie `X-Signature`, puis crée ou met à jour la vente par identifiant de commande.

Les fichiers numériques sont livrés par Lemon Squeezy. Aucun PDF payant n'est placé dans `public/`.

Site connecté à Airtable.
