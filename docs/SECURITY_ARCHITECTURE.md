# Security architecture — Le Hibou Rusé

This document describes trust boundaries and current safeguards. It intentionally contains no credentials.

## Trust boundaries

### 1. Public web

Public endpoints include ordinary pages, forms, conversion events, withdrawal requests, digital-supply consent and the Lemon webhook endpoint.

Expected controls:
- strict input validation;
- body-size limits;
- origin checks where browser-origin semantics matter;
- signed webhook verification;
- idempotency/deduplication for provider events;
- no secret-bearing responses;
- anti-abuse / rate limiting before meaningful traffic.

### 2. Service / admin API

Administrative and orchestration endpoints are not public-control surfaces.

Authentication patterns currently used:
- HTTP Basic for administrator-only reads;
- bearer service secret for internal service calls;
- GitHub Actions OIDC tokens for selected workflows;
- cron secret for selected scheduled flows.

Any new mutating endpoint must choose an explicit authentication pattern rather than relying on obscurity.

### 3. GitHub Actions

Default expectation:
- `contents: read`;
- add `id-token: write` only when OIDC is actually needed;
- no broad repository write permissions unless a specific workflow requires them;
- pin third-party actions to immutable commit SHAs where practical.

### 4. Airtable

Airtable is operational state, not a secret store.

Rules:
- no API keys/passwords in ordinary records;
- encrypted credential vault records remain a special controlled exception only where the connector design requires them;
- backup exports redact suspicious fields by default;
- PII/sensitive tables are excluded from default backups or require explicit encryption.

### 5. Commerce

Lemon Squeezy:
- TEST and LIVE are separate;
- webhook authenticity is HMAC-verified;
- checkout creation remains feature/launch-gated;
- order processing is deduplicated;
- refunds override access.

Delivery providers:
- recipient mutation/revocation is authenticated server-side;
- delivery URLs are allowlisted to expected provider domains.

### 6. Social integrations

OAuth credentials and publication are provider-specific and must fail closed when:
- required grant is missing;
- external approval is absent;
- runtime credential is expired/unrefreshable;
- publication review/feature flag is not satisfied.

A connector being present in code does not imply that external provider access is approved.

### 7. Local Windows worker / video stack

The local PC is a compute boundary, not a public service.

Rules:
- execution disabled by default;
- explicit local opt-in before queue processing;
- no browser-cookie extraction from remote commands;
- ComfyUI and health endpoints bind to loopback;
- no public tunnel by default;
- no paid/cloud fallback;
- heavy model downloads require explicit action.

### 8. Backups

Current backup foundation supports:
- Git bundle;
- safe Airtable exports;
- secret-like field redaction;
- optional encryption for sensitive exports;
- SHA-256 integrity;
- local restore rehearsal.

Remaining resilience work:
- off-site encrypted copy;
- retention policy;
- full staged Airtable restore mapping;
- credential-rotation exercise;
- measured recovery time / recovery point.

## Current open security work

Tracked in Airtable:
- full threat-model / security audit;
- anti-abuse and rate limiting for public endpoints;
- backup/off-site retention;
- restoration and secret-rotation rehearsal.

## Review checklist for a new feature

Before merging a feature that crosses a trust boundary:

- What authenticates the caller?
- Is the action read-only, reversible, or irreversible?
- What happens if a required secret/approval is missing?
- Can a public caller cause paid work or external mutation?
- Is input size/type bounded?
- Is the external destination allowlisted?
- Is replay/idempotency handled?
- Can logs expose PII/secrets?
- Is a feature flag or TEST mode needed?
- How is the feature backed up/recovered?
