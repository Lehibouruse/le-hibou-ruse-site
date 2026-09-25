# Hibou — Incident Response & Recovery Runbook

Version: 2026-09-25  
Scope: repository, Vercel/server routes, Airtable, local ROG worker, video pipeline, commerce integrations and backups.

## Principles

1. **Fail closed first.** Stop the affected execution path before investigating.
2. **Do not paste secrets into GitHub, Airtable, logs, screenshots or chat.**
3. **Preserve evidence before destructive cleanup.** Record timestamps, route/job IDs, commit SHA and non-sensitive error messages.
4. **Separate containment from restoration.** Restoring service is not proof that the original cause is fixed.
5. **No automatic publication or paid fallback during an incident.**
6. **A backup is not considered valid until its manifest hashes and a restore rehearsal pass.**

## Severity

| Level | Examples | Immediate objective |
| --- | --- | --- |
| SEV-0 | confirmed secret leak with active abuse, unauthorized writes/sales/publication, destructive data loss | contain immediately; disable affected path |
| SEV-1 | suspicious auth bypass, worker execution not explicitly approved, corrupted Airtable records, payment/webhook anomaly | contain affected subsystem and preserve evidence |
| SEV-2 | failed deployment, exhausted storage, broken pipeline/QC, dependency vulnerability without evidence of exploitation | stop propagation, diagnose, restore from known-good state |

## Universal first 10 minutes

1. Record UTC/local time, affected component, last known-good commit SHA and observed symptom.
2. Stop only the affected path:
   - local worker: set local execution to disabled / stop its process or scheduled launcher;
   - publication: keep publication authorization false;
   - paid AI: keep paid-AI kill switch disabled;
   - commerce: if integrity is uncertain, block the affected webhook/action path rather than deleting data.
3. Do **not** delete deployments, logs, Airtable rows or backup directories during triage.
4. Run the repository checks from a clean checkout:

```bash
npm run security:api-surface:strict
npm run security:self-check
npm test
npm run build
```

5. Compare the current deployment SHA with the last known-good main SHA.

## Scenario A — suspected secret compromise

### Containment
- Revoke/rotate the credential at the provider first.
- Replace the server-side secret in the deployment environment.
- Redeploy from a known-good `main` commit.
- Do not copy the old/new secret into Airtable, GitHub issues, PRs, logs or this runbook.

### Verification
- Confirm old credential is rejected.
- Confirm new credential works only on its intended route/action.
- Run `npm run security:self-check`.
- Review recent non-sensitive audit/journal events for unexpected calls.

### Closure evidence
- provider rotation timestamp;
- deployment SHA after rotation;
- proof old credential fails;
- proof expected read/test action succeeds;
- no secret value stored in evidence.

## Scenario B — unexpected local ROG worker execution

### Containment
- Stop the local worker process.
- Set `HIBOU_LOCAL_EXECUTION_ENABLED=false` locally.
- Do not approve any new local job.
- Preserve the local job manifest and non-sensitive worker logs.

### Verification
- A remote queue item alone must not be able to execute.
- Restart only with explicit local opt-in and an exact locally approved job.
- Confirm health endpoint remains loopback/local-only.
- Confirm no browser cookie extraction or generic remote shell path exists.

### Closure evidence
- worker disabled proof;
- exact offending/triggering job ID;
- local approval state;
- restart smoke with one benign approved job;
- kill-switch test.

## Scenario C — Airtable corruption or unintended writes

### Containment
- Disable the specific writer/job before editing records.
- Preserve affected record IDs and timestamps.
- Do not bulk-delete or bulk-overwrite.

### Backup / restore rehearsal
Create a fresh safe backup outside the repository:

```bash
npm run backup:local
```

Then rehearse the selected backup directory:

```bash
npm run backup:rehearse -- <backup-directory>
```

The rehearsal must not write to Airtable. It verifies hashes, parses redacted safe exports and tests the Git bundle locally.

### Recovery rule
Restore only the minimum affected records after comparing:
- current record;
- last known-good backup;
- source-of-truth artifact or event.

A full-table restore requires an explicit separate decision and a dry-run diff first.

### Closure evidence
- backup manifest;
- hash verification PASS;
- restore rehearsal PASS;
- list of repaired record IDs;
- before/after diff without secrets.

## Scenario D — compromised or broken deployment

### Containment
- Stop merging unrelated changes.
- Identify deployed commit SHA and last known-good main SHA.
- Do not delete Vercel deployments merely to free storage during incident triage.

### Verification
From the candidate recovery commit:

```bash
npm test
npm run build
npm run security:api-surface:strict
```

CodeQL/Hibou CI must be green before returning to normal change flow.

### Recovery
Prefer a known-good deployment/commit over emergency edits in Production. After recovery, fix forward through a PR with CI rather than leaving an untracked manual patch.

### Closure evidence
- bad and recovered SHAs;
- CI/CodeQL result;
- deployment timestamp;
- endpoint smoke results.

## Scenario E — payment / Lemon webhook anomaly

### Containment
- Keep TEST and LIVE credentials separated.
- If authenticity or idempotence is uncertain, block the affected write path.
- Never use a TEST event to create a real Digify delivery.

### Verification
Confirm:
- webhook signature validation;
- event is the expected type;
- `test_mode` handling;
- order/event deduplication;
- refund is idempotent;
- TEST path produces zero LIVE/Digify effect.

### Closure evidence
Use only order/event IDs and status metadata; never store secret values or signed download URLs.

## Scenario F — corrupted video assets or pipeline output

### Containment
- Publication remains unauthorized.
- Preserve the contract, manifest, scene hashes and QC report.
- Do not regenerate PASS scenes.

### Verification
Use the scene-level artifact hashes to identify the first changed/bad layer. Re-run only the failing scene/layer, then:
- visual QC;
- voice Whisper ↔ verbatim QC;
- master QC.

The Scene Compositor/Asset Graph design must allow replacing one layer without invalidating unrelated scenes.

## Backup 3-2-1 handoff

A local backup is only one copy. After a valid local backup exists, copy it to a genuinely independent destination:

```bash
npm run backup:copy-independent -- --source=<backup-directory> --destination=<independent-root> --copy
```

The tool proves path separation and SHA-256 integrity; **the operator is still responsible for choosing storage that is physically/logically independent** (external disk, NAS or separately synchronized cloud storage).

## Recovery objectives to measure

Do not invent RPO/RTO. On the first real rehearsal, record:

- **RPO observed:** age of the newest usable backup at incident start.
- **RTO repository:** time from start of restore to verified clean checkout/build.
- **RTO Airtable subset:** time to reconstruct a controlled sample without bulk overwrite.
- **RTO local worker:** time to stop, validate approval gates and pass a one-job smoke.
- **RTO commerce TEST:** time to restore a signed, deduplicated TEST webhook path with zero LIVE side effect.

These measured values replace estimates in the roadmap.

## Closure checklist

An incident is closed only when:
- root cause is identified or explicitly bounded;
- containment remains effective;
- CI/security checks pass;
- affected credentials are rotated when relevant;
- restored data/artifacts are hash-verified;
- one controlled smoke test succeeds;
- roadmap evidence is updated;
- preventive action has an owner/status;
- publication/LIVE paths are re-enabled only after the relevant gate is proven.

## What this runbook does not authorize

It does not authorize:
- deleting production data or deployments;
- rotating credentials by exposing them in tooling output;
- enabling public social publication;
- enabling paid AI fallbacks;
- treating a successful unit test as a real runtime proof;
- treating a copied backup as independent unless the destination truly is independent.
