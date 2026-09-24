# Production paid-AI shutdown — deployment runbook

Scope: paid OpenAI API only. Social, commerce, domain checks and deterministic/local processing remain available.

## Before merge
- CI must pass.
- Hard policy guards must cover orchestrator, worker, wake, analyze-montage, book-scheduler and book-finalizer.
- No live OpenAI request is used as a test.

## After merge/deploy
Verify the paid-AI paths stop before any OpenAI request:
- reason = `paid_ai_disabled_by_policy` where applicable;
- `openai_calls=0` where returned;
- agent worker cannot claim or continue a paid-AI job;
- deterministic social/commerce/domain workflows still succeed.

Do not restore paid OpenAI usage or enable a paid fallback.

## Vercel
This change also:
- disables automatic previews for obsolete `hibou-agent/**` branches;
- keeps Git auto-deployment only for `main`;
- makes `lib/` changes deployment-relevant.

Measure Function Storage after deployment and normal Hobby retention. Do not delete production/rollback deployments blindly and do not upgrade the plan without explicit approval.

## Rollback
Revert this pull request. Rollback is not authorization to resume paid OpenAI API usage.
