# Video Studio V5 — readiness status

Branch: `feat/video-studio-v5`.

This branch is intentionally isolated from production. No Airtable migration in this branch is applied automatically, no production publish path is enabled, and no GPU E2E is executed by CI.

| Brique | Coded | CPU/unit tested | Merged to main | Deployed prod | Active |
| --- | --- | --- | --- | --- | --- |
| Timeline intra-scène V1 | yes | yes | no | no | no |
| QC créatif sémantique local | yes | yes (syntax/contract; model inference E2E pending) | no | no | no |
| Registry poses Hibou | yes | yes | no | no | no |
| Prosodie Chatterbox V1 | yes | yes (planner/syntax; audio E2E pending) | no | no | no |
| Musique/mix FFmpeg V1 | yes | yes (plan/policy; audio E2E pending) | no | no | no |
| Cancel / supersede distant V1 | yes | yes (control protocol/static regression; Windows process E2E pending) | no | no | no |

## Feature gates

All V5 execution remains opt-in. Relevant runtime gates:

- `HIBOU_VIDEO_TIMELINE_V1`
- `HIBOU_VIDEO_CREATIVE_QC_V1`
- `HIBOU_VIDEO_POSE_REGISTRY_V1`
- `HIBOU_VIDEO_PROSODY_V1`
- `HIBOU_VIDEO_MUSIC_V1`
- `HIBOU_VIDEO_REMOTE_CANCEL_ENABLED`

Timeline, creative QC, pose registry, prosody and music additionally require the corresponding GLOBAL contract flag. A scene-specific brief cannot silently enable them.

## Prepared Airtable migrations — not applied

- `docs/migrations/airtable-video-studio-v5-profile-fields.json`
- `docs/migrations/airtable-video-remote-cancel-v1.json`

Apply schema changes only when the local production render is idle. Do not rewrite the active global profile during migration.

## E2E tests remaining after the active render

1. Timeline: render a synthetic 9 s scene with four timed text/callout events, one timed object movement and one visual accent; verify one unchanged background and exact event windows.
2. Creative QC: preload the selected local CLIP/SigLIP-compatible model, run known-good/known-bad scene fixtures, calibrate thresholds, verify no network or paid fallback.
3. Pose registry: generate/validate one pose only, mark it `ready` with SHA-256, render static and timed reuse; do not batch-generate the full pose library initially.
4. Prosody: synthesize the sentence « Et tu repayes cette marge. Chaque année. », confirm verbatim transcript, pause, slower second unit and acceptable voice continuity.
5. Music: mix a rights-controlled local test track, inspect ducking/fades and loudness, then human-listen for pumping or clipping.
6. Cancel: on Windows with a disposable test job, request cancel during Chatterbox and during ComfyUI generation; verify only the matching child tree/client_id prompts stop, terminal status is correct, no retry occurs, GPU activity returns to idle, then verify supersede.
7. Resume/cache regression: cancel/restart a separate disposable job and confirm manifests/hashes/cache remain valid.
8. Full human review: render one complete V5 video with publication still disabled.

## Recommended activation order

1. Airtable schema only, all flags false.
2. Timeline V1.
3. Pose registry with one validated `ready` asset.
4. Prosody V1.
5. Music mix V1.
6. Creative QC in advisory mode (`block_on_reject=false`) until thresholds are calibrated.
7. Creative QC blocking only after fixture calibration.
8. Remote cancel/supersede last, after the dedicated Windows E2E.
9. Keep automatic publication disabled throughout; production activation requires explicit separate validation.
