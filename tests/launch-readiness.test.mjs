import assert from "node:assert/strict";
import test from "node:test";
import { commerceTestReadiness, commercialReadiness, CRITICAL_LEGAL } from "../lib/launch-readiness.mjs";

function legal(valid = true) {
  return CRITICAL_LEGAL.map((name) => ({ fields: { Élément: name, Statut: { name: valid ? "Validé" : "À faire" } } }));
}

function chapters(count = 16, ready = true) {
  return Array.from({ length: count }, (_, index) => ({ fields: {
    Chapitre: `Chapitre ${index + 1}`,
    "Contenu V1": "contenu",
    "Validation humaine": ready,
    "Prêt export": ready,
    "QC éditorial": ready ? "pass" : "fail",
  } }));
}

function readyInput() {
  return {
    config: {
      payment_provider: "lemon_squeezy",
      checkout_url: "https://example.lemonsqueezy.com/buy/abc",
      commerce_launch_authorized: "true",
      commerce_readiness_mode: "strict",
      book_current_edition: "V1.0-2026-09",
      public_site_url: "https://d4d5d6.com",
      public_site_host_expected: "d4d5d6.com",
      domain_verified: "true",
    },
    product: {
      "Lemon Squeezy Variant ID": "123",
      "Digify File GUID": "file-guid",
    },
    chapters: chapters(),
    legal: legal(),
    env: {
      LEMON_SQUEEZY_WEBHOOK_SECRET: "secret",
      DIGIFY_KEY_ID: "key",
      DIGIFY_SECRET: "secret",
      DIGIFY_ADD_RECIPIENT_URL: "https://api.digify.com/v1/example/add",
      DIGIFY_ADD_RECIPIENT_BODY_TEMPLATE: "{}",
      DIGIFY_REVOKE_RECIPIENT_URL: "https://api.digify.com/v1/example/revoke",
      DIGIFY_REVOKE_RECIPIENT_BODY_TEMPLATE: "{}",
    },
  };
}

function testReadyInput() {
  return {
    config: {
      lemon_test_mode_only: "TRUE",
      lemon_store_id: "1",
      lemon_product_id: "2",
      lemon_variant_id: "3",
      lemon_test_checkout_id: "4",
      lemon_test_checkout_url: "https://store.lemonsqueezy.com/buy/test",
      lemon_checkout_status: "TEST_READY",
      lemon_test_webhook_id: "5",
      lemon_webhook_status: "TEST_READY",
      digify_test_access_mode: "QUICK_ACCESS_LINK",
      digify_test_permissions: "download=false; print=false",
    },
    product: {
      "Lemon Squeezy Product ID": "2",
      "Lemon Squeezy Variant ID": "3",
      "Digify File GUID": "file-guid",
    },
    env: {
      LEMON_SQUEEZY_API_KEY: "api-key",
      LEMON_SQUEEZY_WEBHOOK_SECRET: "webhook-secret",
      DIGIFY_KEY_ID: "key",
      DIGIFY_SECRET: "digify-secret",
      DIGIFY_ADD_RECIPIENT_URL: "https://api.digify.com/v1/files/file-guid/recipients",
      DIGIFY_ADD_RECIPIENT_BODY_TEMPLATE: "{}",
      DIGIFY_REVOKE_RECIPIENT_URL: "https://api.digify.com/v1/files/file-guid/recipients/test",
      DIGIFY_REVOKE_RECIPIENT_BODY_TEMPLATE: "{}",
    },
  };
}

test("le checkout n'est ouvert que lorsque tous les contrôles stricts sont verts", () => {
  const result = commercialReadiness(readyInput());
  assert.equal(result.ready, true);
  assert.equal(result.blockers.length, 0);
  assert.match(result.checkoutUrl, /^https:/);
});

test("le kill switch bloque même une configuration technique complète", () => {
  const input = readyInput();
  input.config.commerce_launch_authorized = "false";
  const result = commercialReadiness(input);
  assert.equal(result.ready, false);
  assert.equal(result.checkoutUrl, "");
  assert.ok(result.blockers.some((item) => item.key === "launch_authorized"));
});

test("un domaine non vérifié bloque toute ouverture commerciale", () => {
  const input = readyInput();
  input.config.domain_verified = "false";
  const result = commercialReadiness(input);
  assert.equal(result.ready, false);
  assert.equal(result.checkoutUrl, "");
  assert.ok(result.blockers.some((item) => item.key === "domain_verified"));
});

test("un domaine déclaré vérifié mais pointant vers un autre host reste bloqué", () => {
  const input = readyInput();
  input.config.public_site_url = "https://example.com";
  const result = commercialReadiness(input);
  assert.equal(result.ready, false);
  assert.ok(result.blockers.some((item) => item.key === "domain_verified"));
});

test("une édition draft ou un seul chapitre non validé bloque la vente", () => {
  const input = readyInput();
  input.config.book_current_edition = "V1.0-draft-2026-09";
  input.chapters[3].fields["Prêt export"] = false;
  const result = commercialReadiness(input);
  assert.equal(result.ready, false);
  assert.ok(result.blockers.some((item) => item.key === "book_edition"));
  assert.ok(result.blockers.some((item) => item.key === "book_complete"));
});

test("un document juridique critique non validé bloque la vente", () => {
  const input = readyInput();
  input.legal = legal();
  input.legal.find((item) => item.fields.Élément === "CGV produit numérique").fields.Statut = { name: "À faire" };
  const result = commercialReadiness(input);
  assert.equal(result.ready, false);
  assert.ok(result.blockers.some((item) => item.key === "legal:CGV produit numérique"));
});

test("une dépendance serveur Lemon ou Digify absente bloque sans exposer de secret", () => {
  const input = readyInput();
  delete input.env.DIGIFY_SECRET;
  const result = commercialReadiness(input);
  assert.equal(result.ready, false);
  assert.ok(result.blockers.some((item) => item.key === "digify_api"));
  assert.equal(JSON.stringify(result).includes("secret"), false);
});

test("la readiness de test Lemon et Digify est séparée de l'autorisation de vente live", () => {
  const input = testReadyInput();
  const result = commerceTestReadiness(input);
  assert.equal(result.lemon.ready, true);
  assert.equal(result.digify.ready, true);
  assert.equal(result.lemon.blockers.length, 0);
  assert.equal(result.digify.blockers.length, 0);
});

test("un checkout Lemon de test hors domaine Lemon ne peut pas rendre le test prêt", () => {
  const input = testReadyInput();
  input.config.lemon_test_checkout_url = "https://evil.example/checkout";
  const result = commerceTestReadiness(input);
  assert.equal(result.lemon.ready, false);
  assert.ok(result.lemon.blockers.some((item) => item.key === "test_checkout"));
});

test("Digify test reste bloqué si l'ajout ou la révocation ne sont pas entièrement configurés", () => {
  const input = testReadyInput();
  delete input.env.DIGIFY_ADD_RECIPIENT_URL;
  delete input.env.DIGIFY_REVOKE_RECIPIENT_BODY_TEMPLATE;
  const result = commerceTestReadiness(input);
  assert.equal(result.digify.ready, false);
  assert.ok(result.digify.blockers.some((item) => item.key === "add_recipient_endpoint"));
  assert.ok(result.digify.blockers.some((item) => item.key === "revoke_template"));
});
