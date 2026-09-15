import assert from "node:assert/strict";
import test from "node:test";
import { contentEfficiencySummary, providerEfficiencySummary } from "../lib/content-efficiency.mjs";

test("joint une vente à la performance avec provider + content_record_id", () => {
  const performances = [
    { fields: { Provider: "tiktok", "Content Record ID": "recVideo1", "External ID": "tt1", Views: 10000, Likes: 500, Comments: 30, Shares: 100 } },
  ];
  const sales = [
    { fields: { Statut: "paid", Montant: 29, "UTM Source": "tiktok", "UTM Content": "recVideo1" } },
    { fields: { Statut: "paid", Montant: 29, "UTM Source": "tiktok", "UTM Content": "recVideo1" } },
  ];
  const [row] = contentEfficiencySummary(sales, performances);
  assert.equal(row.provider, "tiktok");
  assert.equal(row.content_id, "recVideo1");
  assert.equal(row.views, 10000);
  assert.equal(row.purchases, 2);
  assert.equal(row.net_revenue, 58);
  assert.equal(row.purchases_per_1000_views, 0.2);
  assert.equal(row.revenue_per_1000_views, 5.8);
  assert.equal(row.engagement_rate, 0.063);
});

test("un remboursement réduit le revenu net sans supprimer l'achat historique", () => {
  const rows = contentEfficiencySummary([
    { fields: { Statut: "refunded", Montant: 29, Remboursement: "2026-09-15", "UTM Source": "youtube", "UTM Content": "recVideo2" } },
  ], [
    { fields: { Provider: "youtube", "Content Record ID": "recVideo2", Views: 2000 } },
  ]);
  assert.equal(rows[0].purchases, 1);
  assert.equal(rows[0].refunds, 1);
  assert.equal(rows[0].gross_sales, 29);
  assert.equal(rows[0].net_revenue, 0);
  assert.equal(rows[0].revenue_per_1000_views, 0);
});

test("le même contenu sur deux réseaux reste séparé", () => {
  const rows = contentEfficiencySummary([
    { fields: { Statut: "paid", Montant: 29, "UTM Source": "youtube", "UTM Content": "recSame" } },
    { fields: { Statut: "paid", Montant: 29, "UTM Source": "tiktok", "UTM Content": "recSame" } },
  ], [
    { fields: { Provider: "youtube", "Content Record ID": "recSame", Views: 1000, Likes: 20 } },
    { fields: { Provider: "tiktok", "Content Record ID": "recSame", Views: 10000, Likes: 500 } },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows.find((row) => row.provider === "youtube").revenue_per_1000_views, 29);
  assert.equal(rows.find((row) => row.provider === "tiktok").revenue_per_1000_views, 2.9);
});

test("agrège les créations par provider sans perdre les ratios", () => {
  const providerRows = providerEfficiencySummary([
    { provider: "tiktok", views: 1000, engagements: 100, purchases: 1, refunds: 0, net_revenue: 29 },
    { provider: "tiktok", views: 3000, engagements: 200, purchases: 2, refunds: 0, net_revenue: 58 },
  ]);
  assert.equal(providerRows[0].views, 4000);
  assert.equal(providerRows[0].purchases, 3);
  assert.equal(providerRows[0].net_revenue, 87);
  assert.equal(providerRows[0].purchases_per_1000_views, 0.75);
  assert.equal(providerRows[0].revenue_per_1000_views, 21.75);
});
