import assert from "node:assert/strict";
import test from "node:test";
import { circuitState, isCreditExhausted } from "../lib/openai-circuit.mjs";

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
