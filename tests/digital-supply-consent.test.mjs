import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DIGITAL_SUPPLY_CONSENT_VERSION,
  digitalSupplyCustomData,
  validDigitalSupplyCustomData,
} from "../lib/digital-supply-consent.mjs";

test("le contrat de consentement produit des custom_data strictes et versionnées", () => {
  const data = digitalSupplyCustomData({
    consentId: "consent-123",
    consentAt: "2026-09-22T20:30:00.000Z",
  });
  assert.equal(data.consent_version, DIGITAL_SUPPLY_CONSENT_VERSION);
  assert.equal(data.immediate_supply_consent, "true");
  assert.equal(data.withdrawal_loss_ack, "true");
  assert.equal(validDigitalSupplyCustomData(data), true);
});

test("le consentement est invalide si une preuve manque, est fausse ou d’une autre version", () => {
  const base = digitalSupplyCustomData({ consentId: "consent-123", consentAt: "2026-09-22T20:30:00.000Z" });
  assert.equal(validDigitalSupplyCustomData({ ...base, consent_id: "" }), false);
  assert.equal(validDigitalSupplyCustomData({ ...base, consent_at: "not-a-date" }), false);
  assert.equal(validDigitalSupplyCustomData({ ...base, immediate_supply_consent: "false" }), false);
  assert.equal(validDigitalSupplyCustomData({ ...base, withdrawal_loss_ack: "false" }), false);
  assert.equal(validDigitalSupplyCustomData({ ...base, consent_version: "OLD" }), false);
});

test("la route est désactivée par défaut et sépare TEST et LIVE", () => {
  const route = readFileSync(new URL("../app/api/commerce/digital-supply-consent/route.js", import.meta.url), "utf8");
  assert.match(route, /digital_supply_consent_checkout_mode/);
  assert.match(route, /\["test","live"\]\.includes\(mode\)/);
  assert.match(route, /LEMON_SQUEEZY_TEST_API_KEY/);
  assert.match(route, /commerce_launch_authorized=false/);
  assert.match(route, /digital_supply_consent_durable_confirmation_tested/);
  assert.match(route, /checkoutCustomData/);
  assert.match(route, /immediate_supply_consent !== true/);
  assert.match(route, /withdrawal_loss_ack !== true/);
  assert.doesNotMatch(route, /first_name|last_name|email/);
});

test("le site public passe par la page de consentement et non directement par Lemon", () => {
  const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
  const form = readFileSync(new URL("../components/DigitalSupplyConsentForm.js", import.meta.url), "utf8");
  assert.match(page, /const purchaseUrl = checkoutUrl \? "\/achat-guide" : ""/);
  assert.match(page, /event="purchase_consent_opened"/);
  assert.doesNotMatch(page, /event="checkout_opened" className="button" href=\{checkoutUrl\}/);
  assert.match(form, /immediate_supply_consent/);
  assert.match(form, /withdrawal_loss_ack/);
  assert.match(form, /type="checkbox" required/);
});
