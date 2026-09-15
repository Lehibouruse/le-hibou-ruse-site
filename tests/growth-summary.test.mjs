import assert from "node:assert/strict";
import test from "node:test";
import { contentFunnel, conversionSummary, growthSummary, socialPerformanceSummary } from "../lib/growth-summary.mjs";

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

test("calcule les sessions et clics checkout first-party", () => {
  const summary = conversionSummary([
    { fields: { Event: "landing", "Session ID": "s1" } },
    { fields: { Event: "landing", "Session ID": "s1" } },
    { fields: { Event: "landing", "Session ID": "s2" } },
    { fields: { Event: "checkout_click", "Session ID": "s1" } },
  ]);
  assert.equal(summary.landings, 3);
  assert.equal(summary.unique_sessions, 2);
  assert.equal(summary.checkout_clicks, 1);
  assert.equal(summary.checkout_sessions, 1);
  assert.equal(summary.landing_to_checkout_rate, 0.5);
});

test("agrège les performances sociales par provider", () => {
  const summary = socialPerformanceSummary([
    { fields: { Provider: "youtube", Views: 1000, Clicks: 12, Likes: 50, Comments: 4, Shares: 3, "Watch Time Seconds": 8000 } },
    { fields: { Provider: "youtube", Views: 500, Clicks: 7, Likes: 25, Comments: 2, Shares: 1, "Watch Time Seconds": 4000 } },
  ]);
  assert.equal(summary.views, 1500);
  assert.equal(summary.clicks, 19);
  assert.equal(summary.by_provider[0].watch_time_seconds, 12000);
});

test("joint vues, visites, checkout et ventes par création", () => {
  const funnel = contentFunnel(
    [{ fields: { Statut: "paid", Montant: 29, "UTM Content": "video-42" } }],
    [
      { fields: { Event: "landing", "UTM Content": "video-42" } },
      { fields: { Event: "landing", "UTM Content": "video-42" } },
      { fields: { Event: "checkout_click", "UTM Content": "video-42" } },
    ],
    [{ fields: { "Content Record ID": "video-42", Views: 10000, Clicks: 200 } }],
  );
  assert.equal(funnel[0].views, 10000);
  assert.equal(funnel[0].landings, 2);
  assert.equal(funnel[0].checkout_clicks, 1);
  assert.equal(funnel[0].orders, 1);
  assert.equal(funnel[0].revenue, 29);
  assert.equal(funnel[0].visit_to_purchase_rate, 0.5);
  assert.equal(funnel[0].revenue_per_1000_views, 2.9);
});
