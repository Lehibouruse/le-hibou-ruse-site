# Security Policy

## Reporting a vulnerability

Please do **not** open a public issue for a suspected security vulnerability, leaked credential, access-control weakness, or privacy incident.

Use GitHub's private security-reporting / Security Advisory flow for this repository when available. If private reporting is unavailable, contact the repository owner through a private channel and share only the minimum information needed to reproduce the issue.

Do not include real API keys, access tokens, passwords, customer data, or screenshots containing secrets in a report.

## Scope

Security-sensitive surfaces include:

- Vercel / Next.js API routes;
- Airtable read/write integrations;
- Lemon Squeezy checkout and webhooks;
- Digify delivery/revocation;
- social OAuth and publishing connectors;
- GitHub Actions OIDC workers;
- local Windows media/video worker;
- backup / restore tooling;
- any route that can trigger paid API calls, publication, payment, delivery, or mutation.

## Project security principles

1. **Fail closed.** Missing credentials, approvals, feature flags, or expected state must block the action.
2. **Least privilege.** GitHub Actions, Airtable tokens, OAuth grants, and local workers should receive only the permissions needed.
3. **No secrets in Git/Airtable/docs.** Secrets belong in approved server-side or local secret stores.
4. **TEST before LIVE.** Commerce and social actions must remain separated from production until explicitly validated.
5. **Local means local.** ComfyUI, Chatterbox, worker health endpoints, and local media services must bind to loopback unless a separately reviewed design says otherwise.
6. **No silent paid fallback.** Local/disabled paths must never silently switch to a paid external model/API.
7. **Human review for irreversible actions.** First publication, credential rotation, destructive restore, live checkout and similar actions require explicit review.
8. **Backups are not trusted until restored.** Integrity hashes alone do not prove recoverability.

## Supported security checks

The repository currently uses:

- GitHub Actions CI with read-only repository permissions by default;
- Dependabot for npm and GitHub Actions;
- local static check: `npm run security:self-check`;
- fail-closed service/admin authentication on sensitive API routes;
- signed Lemon Squeezy webhook verification;
- redacted / encrypted local backup tooling;
- explicit opt-in for local worker execution.

These controls reduce risk but are not a substitute for periodic security review.

## Incident response

If a secret may have leaked:

1. revoke/rotate the credential first;
2. disable the affected integration/feature flag;
3. review recent logs and external-provider activity;
4. verify that no persistent access remains;
5. restore from a known-good state if necessary;
6. document what happened and update controls/tests.

Never commit a leaked secret in an attempt to "replace" it; rotate it at the provider and update the secret store.
