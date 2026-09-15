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
    jobs: [{ fields: { status: select("Retry"), error: "credit_balance_exhausted", started_at: "2026-09-15T11:55:00Z" } }],
  });
  assert.equal(snapshot.severity, "critical");
  assert(snapshot.issues.some((item) => item.code === "openai_credit_exhausted_unprotected"));
});

test("le progrès du livre et les OAuth sont comptés sans inventer de readiness", () => {
  const snapshot = systemHealthSnapshot({
    now,
    book: [
      { fields: { "Source début": 1, "Source fin": 5, "Montages couverts": 5, "QC éditorial": "review" } },
      { fields: { "Source début": 6, "Source fin": 10, "Montages couverts": 4, "QC éditorial": "in_progress" } },
    ],
    socialCredentials: [{ fields: { Status: select("Connected") } }, { fields: { Status: select("Disconnected") } }],
    readiness: { ready: false, blockers: [{ key: "domain_verified", detail: "Domaine" }] },
  });
  assert.equal(snapshot.counts.book_assembled_chapters, 1);
  assert.equal(snapshot.counts.social_connected, 1);
  assert.equal(snapshot.launch_ready, false);
  assert.equal(snapshot.counts.launch_blockers, 1);
});
