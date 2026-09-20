import assert from "node:assert/strict";
import test from "node:test";
import {
  COMMERCE_LEASE_MS,
  clearCommerceLease,
  commerceClaimPatch,
  commercePendingFormula,
  commerceStaleFormula,
  ownsCommerceLease,
  refundDeliveryStatus,
} from "../lib/commerce-lease.mjs";

test("pending et stale sont deux files distinctes", () => {
  assert.match(commercePendingFormula("delivery"), /'pending'/);
  assert.doesNotMatch(commercePendingFormula("delivery"), /processing/);
  assert.match(commerceStaleFormula("delivery"), /'processing'/);
  assert.match(commercePendingFormula("revocation"), /'revocation_pending'/);
  assert.match(commerceStaleFormula("revocation"), /'revoking'/);
});

test("un claim porte un token unique et une expiration", () => {
  const now = new Date("2026-09-15T10:00:00.000Z");
  const patch = commerceClaimPatch({ token: "abc", status: "processing", attempts: 2, now });
  assert.equal(patch["Commerce lock token"], "abc");
  assert.equal(patch["Livraison tentatives"], 2);
  assert.equal(Date.parse(patch["Commerce lease expires"]), now.getTime() + COMMERCE_LEASE_MS);
});

test("le propriétaire du bail doit correspondre au token et au statut", () => {
  const record = { fields: { "Commerce lock token": "token-1", "Livraison statut": "processing" } };
  assert.equal(ownsCommerceLease(record, "token-1", "processing"), true);
  assert.equal(ownsCommerceLease(record, "token-2", "processing"), false);
  assert.equal(ownsCommerceLease(record, "token-1", "delivered"), false);
});

test("clearCommerceLease enlève toujours le token et l'expiration", () => {
  assert.deepEqual(clearCommerceLease({ "Livraison statut": "delivered" }), {
    "Livraison statut": "delivered",
    "Commerce lock token": "",
    "Commerce lease expires": null,
  });
});
\ntest("un remboursement garde toute livraison en cours révocable", () => {\n  assert.equal(refundDeliveryStatus("processing"), "revocation_pending");\n  assert.equal(refundDeliveryStatus("delivered"), "revocation_pending");\n  assert.equal(refundDeliveryStatus("revocation_pending"), "revocation_pending");\n  assert.equal(refundDeliveryStatus("revoking"), "revoking");\n  assert.equal(refundDeliveryStatus("pending"), "revoked");\n  assert.equal(refundDeliveryStatus("manual_review"), "manual_review");\n});\n