import assert from "node:assert/strict";
import test from "node:test";
import { GROWTH_EXPERIMENT_THRESHOLDS, proposeGrowthExperiments } from "../lib/growth-experiments.mjs";

function row(overrides = {}) {
  return {
    provider: "tiktok",
    content_id: "video_001",
    views: 12000,
    engagements: 900,
    purchases: 4,
    refunds: 0,
    net_revenue: 116,
    purchases_per_1000_views: 0.3333,
    revenue_per_1000_views: 9.6667,
    engagement_rate: 0.075,
    ...overrides,
  };
}

test("propose de répliquer un contenu économiquement gagnant", () => {
  const proposals = proposeGrowthExperiments({ contentRows: [row()] });
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].channel, "TikTok");
  assert.match(proposals[0].experience, /Répliquer TikTok/);
  assert.match(proposals[0].kpi, /revenu net/i);
});

test("propose de réparer un contenu viral sans achat", () => {
  const proposals = proposeGrowthExperiments({
    contentRows: [row({ content_id: "viral_0", views: 20000, purchases: 0, net_revenue: 0, revenue_per_1000_views: 0, purchases_per_1000_views: 0, engagement_rate: 0.09 })],
  });
  assert.equal(proposals.length, 1);
  assert.match(proposals[0].experience, /viral mais 0 achat/);
});

test("refuse de tirer des conclusions sur un petit échantillon", () => {
  const proposals = proposeGrowthExperiments({
    contentRows: [row({ views: 500, purchases: 1, net_revenue: 29 })],
    funnel: { attributed_visitors: 50, attributed_checkout_sessions: 5, checkout_to_purchase: 0 },
  });
  assert.deepEqual(proposals, []);
});

test("diagnostique une fuite checkout uniquement après assez de sessions", () => {
  const proposals = proposeGrowthExperiments({
    funnel: {
      attributed_visitors: 500,
      attributed_checkout_sessions: 40,
      attributed_purchases: 2,
      checkout_to_purchase: 0.05,
      visitor_to_checkout: 0.08,
      visitor_to_purchase: 0.004,
      net_revenue: 58,
      revenue_per_attributed_visitor: 0.116,
    },
  });
  assert.equal(proposals.length, 1);
  assert.equal(proposals[0].channel, "Landing page");
  assert.match(proposals[0].experience, /checkout → achat/);
});

test("déduplique une expérience déjà proposée", () => {
  const existing = [{ fields: { Expérience: "Répliquer TikTok · video_001 · 3 hooks conversion" } }];
  const proposals = proposeGrowthExperiments({ contentRows: [row()], existing });
  assert.deepEqual(proposals, []);
});

test("limite le nombre de propositions par passage", () => {
  const proposals = proposeGrowthExperiments({
    contentRows: [
      row(),
      row({ content_id: "viral_0", views: 30000, purchases: 0, net_revenue: 0, purchases_per_1000_views: 0, revenue_per_1000_views: 0, engagement_rate: 0.1 }),
    ],
    funnel: {
      attributed_visitors: 1000,
      attributed_checkout_sessions: 30,
      attributed_purchases: 1,
      checkout_to_purchase: 0.033,
      visitor_to_checkout: 0.03,
      visitor_to_purchase: 0.001,
      net_revenue: 29,
      revenue_per_attributed_visitor: 0.029,
    },
  });
  assert.equal(proposals.length, GROWTH_EXPERIMENT_THRESHOLDS.max_proposals);
});
