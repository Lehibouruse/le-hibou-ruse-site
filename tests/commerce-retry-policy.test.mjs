import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const delivery = readFileSync(new URL("../app/api/commerce/delivery/route.js", import.meta.url), "utf8");
const revoke = readFileSync(new URL("../app/api/commerce/revoke/route.js", import.meta.url), "utf8");
const commerce = readFileSync(new URL("../lib/commerce.mjs", import.meta.url), "utf8");

test("livraison et révocation ne rejouent que les erreurs explicitement retryable", () => {
  for (const route of [delivery, revoke]) {
    assert.match(route, /error\?\.retryable === true && attempts < 3/);
    assert.doesNotMatch(route, /error\?\.retryable !== false/);
  }
});

test("Digify ne marque retryable que le rate limit 429", () => {
  assert.match(commerce, /error\.retryable = response\.status === 429/);
  assert.match(commerce, /réponse réseau inconnue; vérifier Digify avant de rejouer/);
  assert.match(commerce, /error\.retryable = false/);
});
