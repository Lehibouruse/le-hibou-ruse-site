import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const readiness = readFileSync(new URL("../lib/launch-readiness.mjs", import.meta.url), "utf8");
const consent = readFileSync(new URL("../app/api/commerce/digital-supply-consent/route.js", import.meta.url), "utf8");
const webhook = readFileSync(new URL("../app/api/commerce/lemon-webhook/route.js", import.meta.url), "utf8");

test("explicit early access authorization can open checkout while unproven QA flags remain warnings", () => {
  assert.match(readiness, /consent_durable_confirmation[\s\S]*!earlyAccess/);
  assert.match(readiness, /commerce_end_to_end[\s\S]*!earlyAccess/);
  assert.match(readiness, /consent_checkout_live/);
  assert.match(readiness, /launch_authorized/);
});

test("live checkout still requires explicit customer consent and authorized launch", () => {
  assert.match(consent, /commerce_launch_authorized=false/);
  assert.match(consent, /immediate_supply_consent !== true/);
  assert.match(consent, /withdrawal_loss_ack !== true/);
  assert.match(consent, /RECEIPT_CONFIRMATION/);
  assert.doesNotMatch(consent, /if \(!truthy\(config\.digital_supply_consent_durable_confirmation_tested\)\) throw/);
  assert.doesNotMatch(consent, /if \(!truthy\(config\.commerce_end_to_end_tested\)\) throw/);
});

test("a signed paid live Lemon order can become reader-ready without falsifying QA evidence", () => {
  assert.match(webhook, /&& consentSatisfied/);
  assert.match(webhook, /&& providerReady/);
  assert.match(webhook, /order\.status === "paid"/);
  assert.match(webhook, /!order\.testMode/);
  assert.doesNotMatch(webhook, /&& commerce\.durableConfirmationTested/);
  assert.doesNotMatch(webhook, /&& commerce\.endToEndTested/);
  assert.match(webhook, /qa_warning=confirmation_durable_non_testee/);
  assert.match(webhook, /qa_warning=end_to_end_non_tested/);
});
