# Video Preview + incremental retouch V1

This layer implements the methodology recorded in Airtable as **10.5 — Aperçu rapide + retouches incrémentales** without changing any active production record.

## Contract

`scripts/video-iteration-plan.mjs` compares two `HIBOU_VIDEO_CONTRACT_V1` contracts for the same content and emits `HIBOU_INCREMENTAL_RETOUCH_PLAN_V1`.

The planner fingerprints independent domains instead of treating the whole video as one cache key:

- narration / breath unit / voice controls;
- image brief / framing / pose request / asset requirements;
- composition / intra-scene timeline / local music cue;
- captions / screen text;
- GLOBAL style, branding, music, engine, feature gates and production profile.

This makes invalidation explicit and conservative. A caption-only change does not invalidate voice or image generation. An image-only change does not invalidate voice. A narration change invalidates audio and downstream artifacts but keeps images reusable unless the visual brief also changed. Scene additions/removals/reordering intentionally trigger conservative invalidation.

## Safety

The planner never deletes artifacts, never kills a worker, never mutates Airtable and never authorizes publication. It only produces a deterministic plan. Human review remains mandatory.

## Preview intent

The master orchestrator now consumes this plan only when both gates are enabled: `features.video_incremental_retouch_v1=true` in the GLOBAL contract and `HIBOU_VIDEO_INCREMENTAL_RETOUCH_V1=true` in the local runtime. The caller must also provide `--reuse-from=<previous-output-root>`, and the new run must use a different output root.

The reuse seed copies only cache material: per-scene Chatterbox cache, a fingerprinted image manifest plus local image outputs that live under the previous run, and the FFmpeg scene cache. Every downstream engine still revalidates its own fingerprint before declaring a cache hit. The previous output root is read-only from the new run's point of view.

Preview and final are separate production modes. PREVIEW defaults to one image candidate per scene, uses the verified lower local image profile when available, and uses a faster FFmpeg encode policy. FINAL retains the premium profile and multi-candidate policy.

No active Airtable profile or running job is modified by this code. The Airtable migration is prepared only; the feature remains off until dedicated E2E validation after the active render.


## Remote queue orchestration

The authenticated Airtable video queue can request a lightweight run with `preview_mode=true`. The queue forces one candidate per scene in preview and the worker forwards the bounded execution policy to the local master as `--production-mode=preview --candidates-per-scene=1`. This changes rendering/generation policy only; it does not override GLOBAL style, character, branding, music policy or QC policy.

A follow-up queue job may set `reuse_from_job_id` to the Airtable record ID of an earlier VIDEO_RENDER job. Arbitrary filesystem paths are not accepted. The queue validates the record-ID shape, the worker derives the previous root under its configured `VIDEO_OUTPUT_ROOT`, and the master still enforces the incremental double gate plus same-content contract checks.

This makes the intended 10.5 loop possible without editing the active GLOBAL profile:

1. create a new preview queue job;
2. optionally point it at the prior queue job ID;
3. reuse fingerprint-valid voice/image/render caches;
4. regenerate only invalidated artifacts;
5. keep human review and publication lock unchanged.
