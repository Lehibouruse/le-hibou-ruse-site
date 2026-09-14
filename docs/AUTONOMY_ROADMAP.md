# Hibou autonomy roadmap

This file intentionally contains no secrets. Runtime credentials belong in the deployment environment.

## Current guardrails
- Social publication is dry-run while Airtable `social_test_mode` is true.
- Human review remains required for first videos.
- Agent PR auto-merge requires explicit `merge_authorization: true`.
- CI validates tests and worker syntax.

## Next autonomy layers
1. Priority-aware queue selection.
2. Social provider status and dry-run tools exposed to HIBOU_AGENT_V1.
3. Direct adapters where official APIs and OAuth permissions allow them.
4. Provider token refresh without persisting refreshed tokens in source.
5. Health diagnostics for queue, social credentials presence, and deployment.
6. Idempotent social dispatch keys and publication journal.
