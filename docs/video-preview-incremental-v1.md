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

The next execution layer may consume this plan to reuse matching hashes and recompute only invalidated artifacts. Preview and final remain separate production modes; switching profile is itself tracked as a production-profile change.

No active Airtable profile or running job is modified by this code.
