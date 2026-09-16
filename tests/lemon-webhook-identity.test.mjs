import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const webhook = readFileSync(new URL("../app/api/commerce/lemon-webhook/route.js", import.meta.url), "utf8");
const access = readFileSync(new URL("../app/api/commerce/access/route.js", import.meta.url), "utf8");

test("le webhook Lemon exige le même order_identifier UUID que le parcours /merci", () => {
  assert.match(webhook, /const UUID_RE = \/\^\[0-9a-f\]\{8\}/);
  assert.match(webhook, /!UUID_RE\.test\(order\.identifier\)/);
  assert.match(webhook, /Missing or invalid order identity/);
  assert.match(webhook, /status: 422/);
  assert.match(access, /const UUID_RE = \/\^\[0-9a-f\]\{8\}/);
});

test("l'identité publique est validée avant toute lecture ou mutation de vente", () => {
  const identityGuard = webhook.indexOf("!UUID_RE.test(order.identifier)");
  const findSales = webhook.indexOf("const matches = await findSales(order.id)");
  const earlyRefund = webhook.indexOf("recordEarlyRefund(order)");
  assert.ok(identityGuard >= 0);
  assert.ok(findSales > identityGuard);
  assert.ok(earlyRefund > identityGuard);
});
