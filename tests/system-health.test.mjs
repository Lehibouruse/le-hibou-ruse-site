import assert from "node:assert/strict";
import test from "node:test";
import { systemHealthSnapshot } from "../lib/system-health.mjs";

const now = Date.parse("2026-09-15T12:00:00Z");
const select = (name) => ({ name });

test("un bail Job expiré est critique", () => {
  const snapshot = systemHealthSnapshot({
    now,
    jobs: [{ fields: { status: select("Running"), lease_expires_at: "2026-09-15T11:50:00Z" } }],
  });
  assert.equal(snapshot.severity, "critical");
  assert(snapshot.issues.some((item) => item.code === "job_lease_expired"));
});

test("un Job Running sans bail est aussi critique", () => {
  const snapshot = systemHealthSnapshot({
    now,
    jobs: [{ fields: { status: select("Running"), lease_expires_at: null } }],
  });
  assert.equal(snapshot.severity, "critical");
  assert.equal(snapshot.counts.running_expired, 1);
});

test("un Retry sans next_run_at est visible comme en retard", () => {
  const snapshot = systemHealthSnapshot({ now, jobs: [{ fields: { status: select("Retry") } }] });
  assert.equal(snapshot.severity, "degraded");
  assert.equal(snapshot.counts.jobs_retry, 1);
  assert.equal(snapshot.counts.retry_overdue, 1);
});

test("les états Jobs sont comptés séparément sans confondre revue humaine et erreur", () => {
  const snapshot = systemHealthSnapshot({
    now,
    jobs: [
      { fields: { status: select("Pending") } },
      { fields: { status: select("Running"), lease_expires_at: "2026-09-15T13:00:00Z" } },
      { fields: { status: select("Retry"), next_run_at: "2026-09-15T13:00:00Z" } },
      { fields: { status: select("Manual Review") } },
      { fields: { status: select("Error") } },
    ],
  });
  assert.equal(snapshot.counts.jobs, 5);
  assert.equal(snapshot.counts.jobs_running, 1);
  assert.equal(snapshot.counts.jobs_retry, 1);
  assert.equal(snapshot.counts.jobs_manual_review, 1);
  assert.equal(snapshot.counts.jobs_error, 1);
  assert(snapshot.issues.some((item) => item.code === "job_error"));
});

test("un crédit épuisé protégé par circuit dégrade sans rendre le système critique", () => {
  const snapshot = systemHealthSnapshot({
    now,
    circuit: { active: true, until: "2026-09-15T13:00:00Z", reason: "credit_balance_exhausted" },
    jobs: [{ fields: { status: select("Retry"), error: "credit_balance_exhausted", started_at: "2026-09-15T11:55:00Z", next_run_at: "2026-09-15T13:00:00Z" } }],
  });
  assert.equal(snapshot.severity, "degraded");
  assert.equal(snapshot.ok, true);
});

test("un crédit épuisé sans circuit est critique", () => {
  const snapshot = systemHealthSnapshot({
    now,
    jobs: [{ fields: { status: select("Retry"), error: "credit_balance_exhausted", started_at: "2026-09-15T11:55:00Z", next_run_at: "2026-09-15T13:00:00Z" } }],
  });
  assert.equal(snapshot.severity, "critical");
  assert(snapshot.issues.some((item) => item.code === "openai_credit_exhausted_unprotected"));
});

test("une livraison processing sans bail est critique", () => {
  const snapshot = systemHealthSnapshot({
    now,
    sales: [{ fields: { "Livraison statut": "processing", "Commerce lease expires": null } }],
  });
  assert.equal(snapshot.severity, "critical");
  assert.equal(snapshot.counts.commerce_active, 1);
  assert.equal(snapshot.counts.commerce_stuck, 1);
});

test("les revues commerce sont dégradées et comptées", () => {
  const snapshot = systemHealthSnapshot({
    now,
    sales: [{ fields: { "Livraison statut": "manual_review" } }],
  });
  assert.equal(snapshot.severity, "degraded");
  assert.equal(snapshot.counts.commerce_manual_review, 1);
});

test("une alerte Digify Print/Download récente dégrade le heartbeat", () => {
  const snapshot = systemHealthSnapshot({
    now,
    policyAlerts: [{ fields: { "Dernière exécution": "2026-09-15T11:45:00Z" } }],
  });
  assert.equal(snapshot.severity, "degraded");
  assert.equal(snapshot.counts.digify_policy_alerts_24h, 1);
  assert(snapshot.issues.some((item) => item.code === "digify_policy_alert"));
});

test("une ancienne alerte Digify ne laisse pas le système dégradé indéfiniment", () => {
  const snapshot = systemHealthSnapshot({
    now,
    policyAlerts: [{ fields: { "Dernière exécution": "2026-09-14T10:00:00Z" } }],
  });
  assert.equal(snapshot.severity, "ok");
  assert.equal(snapshot.counts.digify_policy_alerts_24h, 0);
  assert.equal(snapshot.issues.some((item) => item.code === "digify_policy_alert"), false);
});

test("le progrès du livre et les OAuth sont comptés sans inventer de readiness", () => {
  const snapshot = systemHealthSnapshot({
    now,
    book: [
      { fields: { "Source début": 1, "Source fin": 5, "Montages couverts": 5, "QC éditorial": "review" } },
      { fields: { "Source début": 6, "Source fin": 10, "Montages couverts": 4, "QC éditorial": "in_progress" } },
    ],
    socialCredentials: [{ fields: { Status: select("Connected") } }, { fields: { Status: select("Needs reauth") } }],
    readiness: { ready: false, blockers: [{ key: "domain_verified", detail: "Domaine" }] },
  });
  assert.equal(snapshot.counts.book_assembled_chapters, 1);
  assert.equal(snapshot.counts.social_connected, 1);
  assert.equal(snapshot.counts.social_needs_reauth, 1);
  assert.equal(snapshot.launch_ready, false);
  assert.equal(snapshot.counts.launch_blockers, 1);
  assert(snapshot.issues.some((item) => item.code === "social_oauth_needs_reauth"));
});
