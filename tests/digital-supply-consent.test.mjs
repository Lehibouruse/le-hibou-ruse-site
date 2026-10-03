import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DIGITAL_SUPPLY_CONSENT_VERSION,
  digitalSupplyCustomData,
  consentCheckoutCustomData,
  validDigitalSupplyCustomData,
} from "../lib/digital-supply-consent.mjs";

test("le contrat de consentement produit des custom_data strictes et versionnées", () => {
  const data = digitalSupplyCustomData({ consentId: "consent-123", consentAt: "2026-09-22T20:30:00.000Z" });
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

test("le checkout reçoit la même session et les UTM nettoyées que la visite", () => {
  const custom = consentCheckoutCustomData(
    { consentId: "consent-123", consentAt: "2026-09-22T20:30:00.000Z" },
    { session_id: "session-abc", utm_source: "  google  ", utm_campaign: "x".repeat(200) },
  );
  assert.equal(custom.session_id, "session-abc");
  assert.equal(custom.utm_source, "google");
  assert.equal(custom.utm_campaign.length, 120);
  assert.equal(validDigitalSupplyCustomData(custom), true);
});

test("la route est désactivée par défaut et sépare TEST et LIVE", () => {
  const route = readFileSync(new URL("../app/api/commerce/digital-supply-consent/route.js", import.meta.url), "utf8");
  assert.match(route, /digital_supply_consent_checkout_mode/);
  assert.match(route, /\["test","live"\]\.includes\(mode\)/);
  assert.match(route, /LEMON_SQUEEZY_TEST_API_KEY/);
  assert.match(route, /commerce_launch_authorized=false/);
  assert.match(route, /checkoutCustomData/);
  assert.match(route, /RECEIPT_CONFIRMATION/);
  assert.doesNotMatch(route, /preuve durable du parcours de consentement non validée/);
  assert.doesNotMatch(route, /parcours de paiement et livraison non validé de bout en bout/);
  assert.match(route, /immediate_supply_consent !== true/);
  assert.match(route, /withdrawal_loss_ack !== true/);
  assert.match(route, /request_id/);
  assert.match(route, /existingConsentRequest\(requestId\)/);
  assert.match(route, /"URL résultat"/);
  assert.match(route, /deduplicated: true/);
  assert.doesNotMatch(route, /first_name|last_name|email/);
});

test("la vitrine ouvre uniquement le parcours de consentement après validation commerciale", () => {
  const offer = readFileSync(new URL("../lib/book-offer.js", import.meta.url), "utf8");
  const store = readFileSync(new URL("../components/BookStore.js", import.meta.url), "utf8");
  const readiness = readFileSync(new URL("../lib/launch-readiness.mjs", import.meta.url), "utf8");
  const form = readFileSync(new URL("../components/DigitalSupplyConsentForm.js", import.meta.url), "utf8");
  assert.match(offer, /commercialReadiness\(/);
  assert.match(offer, /purchaseUrl: readiness\.ready \? ['"]\/achat-guide['"] : ['"]/);
  assert.match(store, /offer\.ready \? <BookAction href=\{offer\.purchaseUrl\}/);
  assert.match(readiness, /consent_checkout_live/);
  assert.match(readiness, /digital_supply_consent_checkout_mode\)\.toLowerCase\(\) === "live"/);
  assert.match(form, /immediate_supply_consent/);
  assert.match(form, /withdrawal_loss_ack/);
  assert.match(form, /requestId = useRef/);
  assert.match(form, /randomUUID/);
  assert.match(form, /request_id: requestId\.current/);
  assert.match(form, /type="checkbox" required/);
});
