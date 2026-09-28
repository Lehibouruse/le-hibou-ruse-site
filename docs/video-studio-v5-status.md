# Video Studio V5 — readiness status

Branch: `feat/video-studio-v5`.

This branch is intentionally isolated from production. No Airtable migration in this branch is applied automatically, no production publish path is enabled, and no GPU E2E is executed by CI.

| Brique | Coded | CPU/unit tested | Merged to main | Deployed prod | Active |
| --- | --- | --- | --- | --- | --- |
| Timeline intra-scène V1 | yes | yes | no | no | no |
| Prompt Graph V1 | yes | yes CPU (GLOBAL refs, scene delta, attention beats, primitives éditoriales, fingerprint déterministe; runtime non branché) | no | no | no |
| QC créatif sémantique local | yes | yes (syntax/contract; model inference E2E pending) | no | no | no |
| Registry poses Hibou | yes | yes | no | no | no |
| Prosodie Chatterbox V1 | yes | yes (planner/syntax; audio E2E pending) | no | no | no |
| Musique/mix FFmpeg V1 | yes | yes (plan/policy; audio E2E pending) | no | no | no |
| Cancel / supersede distant V1 | yes | yes (job/PID + worker-session binding, explicit request id/time, anti-replay consumed receipt; Windows process E2E pending) | no | no | no |
| Preview + retouches incrémentales V1 | yes | yes (planner/cache/profile/lineage + parent-worker ownership CPU tests; real media reuse E2E pending) | no | no | no |
| Verrou PREVIEW / publication | yes | yes (contract + registry tests; publish E2E intentionally disabled) | no | no | no |
| Audit global verrou publication | yes | yes CPU (scan artefacts, fail-closed sur publication/auto-publish/PREVIEW full master) | no | no | no |
| Plan E2E machine-readable sécurisé | yes | yes CPU (dépendances, idle, run jetable, démarrage manuel, publication false) | no | no | no |
| Chaîne preuve code → E2E → activation | yes | yes CPU (liens E2E vérifiés, activation inactive par étape, activation prématurée rejetée) | no | no | no |
| Sélection humaine candidats V1 | yes | yes (review package, contact sheet, stale-decision fingerprint, pause/resume + worker local propriétaire) | no | no | no |
| Reprise humaine distante | yes | yes statique (Airtable pause → fingerprint → worker local) | no | no | no |
| Ranking image ambiguïté-aware | yes | yes (ties/near-ties => aucun faux winner machine) | no | no | no |
| Télémétrie débit images | yes | yes (durée/candidat + estimations 1/2/3 candidats par scène) | no | no | no |
| Historique stages pipeline | yes | yes (START/PASS/ERROR, durée, tentative) | no | no | no |
| Heartbeat vidéo détaillé | yes | yes statique (voix/images/clips, %, durée stage) | no | no | no |
| Heartbeat progression unitaire | yes | yes statique (images/voix/clips + % + temps stage) | no | no | no |
| Plan de reprise après échec V1 | yes | yes CPU (diagnostic + invalidations + caches conservés, aucune exécution) | no | no | no |
| Reprise contrôlée avec reçu | yes | yes CPU + CLI temp (suffixe canonique, double opt-in, backup, reçu SHA256) | no | no | no |
| Reset état de reprise | yes | yes CPU (dry-run, plan SHA + state SHA + env gate, caches préservés) | no | no | no |
| Diagnostic worker de reprise | yes | yes statique (plan commit-pinné joint aux erreurs, aucune reprise automatique) | no | no | no |
| Retry transitoire local V1 | yes | yes CPU (opt-in, ≤2, provenance worker/session, retry épinglé au worker propriétaire) | no | no | no |
| Audit local de run V1 | yes | yes CPU (stages, voix, images, caches, reprise; lecture seule) | no | no | no |
| Audit état reprise préparée | yes | yes CPU (receipt + marker local + second démarrage explicite) | no | no | no |
| Audit démarrage réparation | yes | yes CPU (phase execution_started + validation reçu de start) | no | no | no |
| Reprise distante après erreur | yes | yes statique/CPU (double gate, 2 consentements + 4 hashes, reçu one-shot, reprise épinglée au worker propriétaire des artefacts locaux) | no | no | no |
| Readiness réparation distante 2 phases | yes | yes CPU (START sans RESUME bloqué, prepare-only signalé, double consentement explicite) | no | no | no |
| QC durée voix / retry borné | yes | yes (speech-rate plausibility + cache invalidation + single deterministic retry) | no | no | no |
| Revue éditoriale humaine V4 | yes | yes (checklist/manifeste CPU; décision humaine réelle pending) | no | no | no |
| Diff revue incrémentale actionnable | yes | yes CPU (domaines changés, stages à revalider, régénérations forcées, caches réutilisables) | no | no | no |
| File de revue incrémentale intégrée | yes | yes CPU (scene_review_queue + fallback FULL si diff absent/invalide) | no | no | no |
| Plan stockage durable V1 | yes | yes (plan content-addressed, aucun transfert) | no | no | no |
| Manifeste stockage durable dédupliqué | yes | yes CPU (objets SHA256 immuables, références de run, verify-existing, priorité rétention) | no | no | no |
| Rendu ASS Windows autonome | yes | yes CPU (Fontconfig privé + Windows Fonts) | no | no | no |
| Police ASS Windows native | yes | yes (Arial Windows + métadonnée contrat) | no | no | no |

## Feature gates

All V5 execution remains opt-in. Relevant runtime gates:

- `HIBOU_VIDEO_TIMELINE_V1`
- `HIBOU_VIDEO_CREATIVE_QC_V1`
- `HIBOU_VIDEO_POSE_REGISTRY_V1`
- `HIBOU_VIDEO_PROSODY_V1`
- `HIBOU_VIDEO_MUSIC_V1`
- `HIBOU_VIDEO_REMOTE_CANCEL_ENABLED`
- `HIBOU_VIDEO_REMOTE_REPAIR_RESUME_ENABLED`
- `HIBOU_VIDEO_REMOTE_REPAIR_START_ENABLED`
- `HIBOU_VIDEO_INCREMENTAL_RETOUCH_V1`
- `HIBOU_VIDEO_HUMAN_SELECTION_V1`

Timeline, creative QC, pose registry, prosody and music additionally require the corresponding GLOBAL contract flag. A scene-specific brief cannot silently enable them.

## Airtable V5 schema

- La migration structurelle V5 des champs `Profils vidéo` / `Scènes vidéo` est désormais présente dans Airtable, mais les nouveaux flags du profil actif restent non activés.
- `docs/migrations/airtable-video-studio-v5-profile-fields.json` reste la trace de migration.
- `docs/migrations/airtable-video-remote-cancel-v1.json` reste préparée et ne doit pas être appliquée pendant un rendu actif.

Aucun changement de profil global actif n'est réalisé par cette branche.

## E2E tests remaining after the active render

1. Timeline: render a synthetic 9 s scene with four timed text/callout events, one timed object movement and one visual accent; verify one unchanged background and exact event windows.
2. Creative QC: preload the selected local CLIP/SigLIP-compatible model, run known-good/known-bad scene fixtures, calibrate thresholds, verify no network or paid fallback.
3. Pose registry: generate/validate one pose only, mark it `ready` with SHA-256, render static and timed reuse; do not batch-generate the full pose library initially.
4. Prosody: synthesize the sentence « Et tu repayes cette marge. Chaque année. », confirm verbatim transcript, pause, slower second unit and acceptable voice continuity.
5. Music: mix a rights-controlled local test track, inspect ducking/fades and loudness, then human-listen for pumping or clipping.
6. Cancel: on Windows with a disposable test job, request cancel during Chatterbox and during ComfyUI generation; verify only the matching child tree/client_id prompts stop, terminal status is correct, no retry occurs, GPU activity returns to idle, then verify supersede.
7. Resume/cache regression: cancel/restart a separate disposable job and confirm manifests/hashes/cache remain valid.
8. Incremental preview: create a disposable PREVIEW from a completed test run with `--reuse-from`; verify unchanged Chatterbox scenes, unchanged image requests and unchanged FFmpeg scene clips are cache hits, while one edited caption/image/voice unit invalidates only its expected dependency path.
   Also verify same-content lineage, same-worker ownership when present, and parent master SHA-256 integrity before any cache is seeded.
9. Human candidate checkpoint: FINAL doit se mettre en pause avec `WAITING_HUMAN_SELECTION`, produire le contact sheet/template, accepter une décision liée au fingerprint exact du lot, reprendre le même job sans régénérer les images, puis supprimer le marqueur d'attente.
10. Full human review: render one complete V5 video with publication still disabled.

## Recommended activation order

1. Airtable schema only, all flags false.
2. Timeline V1.
3. Pose registry with one validated `ready` asset.
4. Prosody V1.
5. Music mix V1.
6. Creative QC in advisory mode (`block_on_reject=false`) until thresholds are calibrated.
7. Creative QC blocking only after fixture calibration.
8. Preview + incremental retouch after cache-reuse E2E; keep the GLOBAL flag false until then.
9. Remote cancel/supersede last, after the dedicated Windows E2E.
10. Keep automatic publication disabled throughout; PREVIEW is always `preview_only`, and even FINAL artifact registries remain non-publishable until an explicit separate human publication step is designed and validated.
