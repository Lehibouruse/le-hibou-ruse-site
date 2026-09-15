import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../app/api/commerce/bootstrap/route.js", import.meta.url), "utf8");

test("le bootstrap Lemon est explicitement opt-in", () => {
  assert.match(route, /LEMON_BOOTSTRAP_ALLOW/);
  assert.match(route, /changed: false, ready: false/);
});

test("le bootstrap exige store, API key et secret webhook côté serveur", () => {
  assert.match(route, /LEMON_SQUEEZY_STORE_ID/);
  assert.match(route, /LEMON_SQUEEZY_API_KEY/);
  assert.match(route, /LEMON_SQUEEZY_WEBHOOK_SECRET/);
  assert.doesNotMatch(route, /AIRTABLE.*LEMON_SQUEEZY_API_KEY/);
});

test("le checkout rattache le Variant ID et les données custom utiles", () => {
  assert.match(route, /Lemon Squeezy Variant ID/);
  assert.match(route, /checkout_data/);
  assert.match(route, /product_slug/);
  assert.match(route, /source: "hibou-site"/);
});

test("le webhook Lemon créé automatiquement couvre achat et remboursement", () => {
  assert.match(route, /order_created/);
  assert.match(route, /order_refunded/);
  assert.match(route, /api\/commerce\/lemon-webhook/);
});

test("le mode test ne rend jamais le checkout Actif", () => {
  assert.match(route, /testMode \? "En attente" : "Actif"/);
});
