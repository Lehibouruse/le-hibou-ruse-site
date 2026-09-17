import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const delivery = readFileSync(new URL("../app/api/commerce/delivery/route.js", import.meta.url), "utf8");

test("toute ambiguïté de vente bloque la livraison Digify avant l'effet externe", () => {
  const duplicateGuardAt = delivery.indexOf("if (matches.length !== 1)");
  const externalEffectAt = delivery.indexOf("addDigifyRecipient({ fileGuid, email, orderId })");
  assert.ok(duplicateGuardAt >= 0);
  assert.ok(externalEffectAt > duplicateGuardAt);
  assert.match(delivery, /livraison bloquée jusqu'à réconciliation/);
  assert.match(delivery, /reason: guard\.refunded \? "refund_guard" : "duplicate_order_guard"/);
  assert.doesNotMatch(delivery, /seul .*record canonique.*peut être livré/);
});
