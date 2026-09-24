# Artefacts canoniques

## Vidéo
- `video/contracts/` — contrats pilotes.
- `docs/video-contract-v1.md`
- `docs/video-generation-interfaces-v1.md`
- `docs/video-local-pipeline-v1.md`
- `docs/video-first-run-windows.md`
- `scripts/video-smoke-one-scene.mjs`
- `scripts/video-local-render.mjs`
- `scripts/video-master-qc.mjs`
- `scripts/video-airtable-smoke-report.mjs`

## Worker local
- `scripts/hibou-github-worker.mjs` — mode recommandé sans token pour commencer.
- `scripts/hibou-local-worker.mjs` — mode avancé Airtable bidirectionnel.
- Aucun démarrage implicite.

## Commerce
- `docs/WORK_LEMON_TEST_RUNBOOK.md`
- `docs/COMMERCE_LAUNCH_RUNBOOK.md`
- Routes `app/api/commerce/*`
- TEST avant LIVE.

## Sécurité
- `docs/SECURITY_BASELINE.md`
- `config/security-sensitive-routes.json`
- `scripts/security-self-check.mjs`
- tests `security-*.test.mjs`, `no-tracked-secrets.test.mjs`

## Sauvegarde
- `config/backup-plan.json`
- `scripts/backup-project-local.mjs`
- `scripts/restore-rehearsal-local.mjs`
- `docs/backup-restore-local.md`

## Livre
- La liste canonique et la charte sont pilotées dans Airtable.
- Le texte final et les livrables sont rangés dans Library.
- Ne pas lancer d'anciens jobs CREATE_BOOK API.
