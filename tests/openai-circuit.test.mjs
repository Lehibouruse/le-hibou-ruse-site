import assert from "node:assert/strict";
import test from "node:test";
import { circuitState, creditPausePatch, isCreditExhausted } from "../lib/openai-circuit.mjs";

test("reconnaît uniquement les erreurs de crédit/billing", () => {
  assert.equal(isCreditExhausted("OpenAI book: 429 credit_balance_exhausted"), true);
  assert.equal(isCreditExhausted("insufficient_quota"), true);
  assert.equal(isCreditExhausted("billing_hard_limit reached"), true);
  assert.equal(isCreditExhausted("rate_limit_exceeded"), false);
  assert.equal(isCreditExhausted("timeout"), false);
});

test("le circuit est actif uniquement avant son échéance", () => {
  const now = Date.parse("2026-09-15T12:00:00Z");
  const active = circuitState({ openai_credit_circuit_until: "2026-09-15T13:00:00Z", openai_credit_circuit_minutes: "60" }, now);
  assert.equal(active.active, true);
  assert.equal(active.minutes, 60);
  const expired = circuitState({ openai_credit_circuit_until: "2026-09-15T11:59:00Z" }, now);
  assert.equal(expired.active, false);
});

test("la durée du circuit est bornée", () => {
  assert.equal(circuitState({ openai_credit_circuit_minutes: "1" }, 0).minutes, 15);
  assert.equal(circuitState({ openai_credit_circuit_minutes: "9999" }, 0).minutes, 360);
});

test("une pause crédit remet le Job en Retry sans consommer de tentative", () => {
  const patch = creditPausePatch(
    { retry_count: 2 },
    { until: "2026-09-15T14:00:00.000Z" },
    "OpenAI book: 429 credit_balance_exhausted",
  );
  assert.equal(patch.status, "Retry");
  assert.equal(patch.retry_count, 2);
  assert.equal(patch.next_run_at, "2026-09-15T14:00:00.000Z");
  assert.equal(patch.completed_at, null);
  assert.equal(patch.agent_status, "waiting_for_credit");
  assert.equal(patch.lock_token, "");
  assert.equal(patch.lease_expires_at, null);
});

test("des pauses crédit répétées restent non destructives pour retry_count", () => {
  let fields = { retry_count: 1 };
  for (const until of ["2026-09-15T14:00:00Z", "2026-09-15T15:00:00Z", "2026-09-15T16:00:00Z"]) {
    const patch = creditPausePatch(fields, { until }, "insufficient_quota");
    assert.equal(patch.retry_count, 1);
    assert.equal(patch.status, "Retry");
    fields = { ...fields, ...patch };
  }
});

test("une pause crédit refuse une échéance invalide", () => {
  assert.throws(() => creditPausePatch({}, { until: "" }, "credit_balance_exhausted"), /Échéance circuit OpenAI invalide/);
});
