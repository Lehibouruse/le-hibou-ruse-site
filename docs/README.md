# Documentation canonique — Le Hibou Rusé

## À lire d’abord
- `../README.md` — vue d’ensemble.
- `../WORK_STATE.md` — état de reprise courant.
- `AUTONOMY_ROADMAP.md` — architecture d’automatisation.
- `NO_SECRETS.md` — règles de secrets.

## Vidéo
- `video-first-run-windows.md` — premier lancement sur le PC réel.
- `local-video-gpu-runbook.md` — préflight GPU / Chatterbox / ComfyUI.
- `video-contract-v1.md` + `video-contract-v1.schema.json` — contrat vidéo.
- `video-generation-interfaces-v1.md` — interfaces IMAGE_GEN / VOICE_GEN.
- `video-local-pipeline-v1.md` — pipeline local.
- `video-windows-gpu-check.md` — diagnostic Windows.

Les anciens documents V1/V2 non listés ici sont conservés comme références historiques ; en cas de divergence, le code actuel et les documents ci-dessus priment.

## Worker local
Deux modes existent :
1. **recommandé pour démarrer** : worker GitHub sans token ;
2. **avancé** : worker Airtable bidirectionnel avec token.

Aucun worker ne doit démarrer implicitement.

## Commerce
- `COMMERCE_LAUNCH_RUNBOOK.md`
- `WORK_LEMON_TEST_RUNBOOK.md`
- `launch-runbook.md`

TEST précède toujours LIVE. Le consentement numérique reste feature-flagged.

## Réseaux sociaux
- `SOCIAL_CONTROL_PLANE.md`
- `SOCIAL_AUTHORIZATION_RUNBOOK.md`
- `SOCIAL_API_MATRIX.md`
- `SOCIAL_METRICS.md`

Code présent ≠ accès externe approuvé ≠ runtime testé ≠ publication autorisée.

## Nettoyage
Les anciens fichiers marqueurs de CI/redéploiement non référencés ont été retirés. Les preuves, runbooks et artefacts fonctionnels sont conservés.
