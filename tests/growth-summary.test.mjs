import assert from "node:assert/strict";
import test from "node:test";
import { funnelSummary, growthSummary } from "../lib/growth-summary.mjs";

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

test("une vente sans UTM reste visible comme non attribuée même si Lemon est la provenance", () => {
  const summary = growthSummary([{ fields: { Statut: "paid", Montant: 29, Provenance: "Lemon Squeezy" } }]);
  assert.equal(summary.paid_orders, 1);
  assert.equal(summary.attributed_orders, 0);
  assert.equal(summary.attribution_rate, 0);
  assert.equal(summary.by_source[0].key, "non_attribué");
});

test("calcule le funnel par vidéo à partir des sessions first-party et des ventes", () => {
  const events = [
    { fields: { Event: "landing", "Session ID": "s1", "UTM Source": "tiktok", Campaign: "launch", "UTM Content": "video-01" } },
    { fields: { Event: "landing", "Session ID": "s2", "UTM Source": "tiktok", Campaign: "launch", "UTM Content": "video-01" } },
    { fields: { Event: "landing", "Session ID": "s3", "UTM Source": "tiktok", Campaign: "launch", "UTM Content": "video-01" } },
    { fields: { Event: "landing", "Session ID": "s4", "UTM Source": "tiktok", Campaign: "launch", "UTM Content": "video-01" } },
    { fields: { Event: "checkout_click", "Session ID": "s1", "UTM Source": "tiktok", Campaign: "launch", "UTM Content": "video-01" } },
    { fields: { Event: "checkout_click", "Session ID": "s2", "UTM Source": "tiktok", Campaign: "launch", "UTM Content": "video-01" } },
    { fields: { Event: "checkout_click", "Session ID": "s2", "UTM Source": "tiktok", Campaign: "launch", "UTM Content": "video-01" } },
  ];
  const sales = [
    { fields: { Statut: "paid", Montant: 29, "UTM Source": "tiktok", Campagne: "launch", "UTM Content": "video-01" } },
  ];
  const summary = funnelSummary(sales, events);
  const video = summary.by_content.find((item) => item.key === "video-01");
  assert.equal(summary.attributed_visitors, 4);
  assert.equal(summary.attributed_checkout_sessions, 2);
  assert.equal(summary.checkout_clicks, 3);
  assert.equal(summary.attributed_purchases, 1);
  assert.equal(summary.visitor_to_checkout, 0.5);
  assert.equal(summary.visitor_to_purchase, 0.25);
  assert.equal(summary.checkout_to_purchase, 0.5);
  assert.equal(video.visitors, 4);
  assert.equal(video.checkout_sessions, 2);
  assert.equal(video.purchases, 1);
  assert.equal(video.net_revenue, 29);
  assert.equal(video.revenue_per_visitor, 7.25);
});

test("un remboursement reste un achat mais réduit le revenu net", () => {
  const summary = funnelSummary([
    { fields: { Statut: "paid", Montant: 29, "UTM Source": "youtube" } },
    { fields: { Statut: "refunded", Montant: 29, "UTM Source": "youtube", Remboursement: "2026-09-15" } },
  ], []);
  const youtube = summary.by_source.find((item) => item.key === "youtube");
  assert.equal(summary.purchases, 2);
  assert.equal(summary.refunds, 1);
  assert.equal(summary.gross_sales, 58);
  assert.equal(summary.refunded_revenue, 29);
  assert.equal(summary.net_revenue, 29);
  assert.equal(youtube.purchases, 2);
  assert.equal(youtube.refund_rate, 0.5);
});
