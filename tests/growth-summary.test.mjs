import assert from "node:assert/strict";
import test from "node:test";
import { growthSummary } from "../lib/growth-summary.mjs";

test("classe les sources et contenus par revenu attribué", () => {
  const summary = growthSummary([
    { fields: { Statut: "paid", Montant: 29, "UTM Source": "tiktok", Campagne: "launch", "UTM Content": "video-01" } },
    { fields: { Statut: "paid", Montant: 29, "UTM Source": "tiktok", Campagne: "launch", "UTM Content": "video-01" } },
    { fields: { Statut: "paid", Montant: 29, "UTM Source": "youtube", Campagne: "evergreen", "UTM Content": "short-04" } },
  ]);
  assert.equal(summary.paid_orders, 3);
  assert.equal(summary.gross_revenue, 87);
  assert.equal(summary.attribution_rate, 1);
  assert.equal(summary.by_source[0].key, "tiktok");
  assert.equal(summary.by_source[0].revenue, 58);
  assert.equal(summary.by_content[0].key, "video-01");
});

test("les remboursements ne gonflent pas le CA", () => {
  const summary = growthSummary([
    { fields: { Statut: "paid", Montant: 29, "UTM Source": "instagram" } },
    { fields: { Statut: "refunded", Montant: 29, "UTM Source": "instagram", Remboursement: "2026-09-15" } },
  ]);
  assert.equal(summary.paid_orders, 1);
  assert.equal(summary.refunds, 1);
  assert.equal(summary.gross_revenue, 29);
  assert.equal(summary.by_source[0].orders, 1);
  assert.equal(summary.by_source[0].refunds, 1);
});

test("une vente sans UTM reste visible comme non attribuée", () => {
  const summary = growthSummary([{ fields: { Statut: "paid", Montant: 29 } }]);
  assert.equal(summary.paid_orders, 1);
  assert.equal(summary.attributed_orders, 0);
  assert.equal(summary.attribution_rate, 0);
  assert.equal(summary.by_source[0].key, "non_attribué");
});
