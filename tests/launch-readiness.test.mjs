import assert from "node:assert/strict";
import test from "node:test";
import { commercialReadiness, CRITICAL_LEGAL } from "../lib/launch-readiness.mjs";

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
      DIGIFY_ADD_RECIPIENT_BODY_TEMPLATE: "{}",
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
