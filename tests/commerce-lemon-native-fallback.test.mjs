import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const delivery = readFileSync(new URL("../app/api/commerce/delivery/route.js", import.meta.url), "utf8");

test("le fallback Lemon natif est fermé par défaut et ne remplace pas Digify implicitement", () => {
  assert.match(delivery, /activeConfigurationValue\("delivery_provider_mode", "digify"\)/);
  assert.match(delivery, /lemon_native_delivery_verified/);
  assert.match(delivery, /lemon_native_delivery_not_verified/);
  assert.match(delivery, /delivery_provider_invalid/);
});

test("le mode Lemon natif ne déclenche aucun effet Digify", () => {
  const nativeAt = delivery.indexOf('if (provider === "lemon_native")');
  const digifyAt = delivery.indexOf("addDigifyRecipient({ fileGuid, email, orderId })");
  assert.ok(nativeAt >= 0);
  assert.ok(digifyAt > nativeAt);
  const nativeBlock = delivery.slice(nativeAt, digifyAt);
  assert.doesNotMatch(nativeBlock, /addDigifyRecipient/);
  assert.match(nativeBlock, /delivery_surface: "lemon_my_orders"/);
  assert.match(nativeBlock, /no_digify_watermark/);
  assert.match(nativeBlock, /no_proven_individual_refund_revocation/);
});

test("le fallback Lemon conserve les gardes commande/remboursement avant toute livraison", () => {
  const guardAt = delivery.indexOf("deliveryOrderGuard(current)");
  const nativeAt = delivery.indexOf('if (provider === "lemon_native")', guardAt);
  assert.ok(guardAt >= 0);
  assert.ok(nativeAt > guardAt);
  assert.match(delivery, /refund_guard/);
  assert.match(delivery, /duplicate_order_guard/);
});

test("le fallback refuse toujours une édition non finale", () => {
  const nativeAt = delivery.indexOf('if (provider === "lemon_native")');
  const nextDigify = delivery.indexOf('if (!fileGuid || !email || !finalEdition(edition))', nativeAt);
  const nativeBlock = delivery.slice(nativeAt, nextDigify);
  assert.match(nativeBlock, /!finalEdition\(edition\)/);
  assert.match(nativeBlock, /manual_review/);
});
