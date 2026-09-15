import assert from "node:assert/strict";
import test from "node:test";
import { buildSocialPerformanceFields, socialMetricsDetails } from "../lib/social-performance-fields.mjs";

const target = {
  provider: "instagram",
  external_id: "ig-123",
  content_record_id: "recContent",
  url: "https://example.com/fallback",
};

test("un relevé réussi persiste les compteurs canoniques et les métriques enrichies", () => {
  const fields = buildSocialPerformanceFields({
    key: "instagram:ig-123",
    target,
    capturedAt: "2026-09-15T18:00:00.000Z",
    metrics: {
      url: "https://www.instagram.com/p/example/",
      views: 1200,
      likes: 80,
      comments: 9,
      shares: 12,
      saves: 18,
      watch_time_seconds: 0,
      completion: 0,
      clicks: 0,
      followers_generated: 3,
      reach: 950,
      total_interactions: 119,
      average_view_duration_seconds: 4.25,
      analytics_status: "active",
      analytics_metrics: ["views", "reach", "saved", "shares"],
      media_type: "VIDEO",
      media_product_type: "REELS",
      credential_source: "vault",
    },
  });

  assert.equal(fields.Views, 1200);
  assert.equal(fields.Reach, 950);
  assert.equal(fields["Total Interactions"], 119);
  assert.equal(fields["Average View Duration Seconds"], 4.25);
  assert.equal(fields["Analytics Status"], "active");
  const details = JSON.parse(fields["Metrics Details JSON"]);
  assert.deepEqual(details.analytics_metrics, ["views", "reach", "saved", "shares"]);
  assert.equal(details.media_product_type, "REELS");
  assert.equal(details.credential_source, "vault");
});

test("un refresh en erreur n'écrase pas les derniers compteurs connus avec des zéros", () => {
  const fields = buildSocialPerformanceFields({
    key: "instagram:ig-123",
    target,
    metrics: null,
    state: "needs_reauth",
    error: "permission expirée",
    capturedAt: "2026-09-15T18:05:00.000Z",
  });

  assert.equal(fields.Status, "needs_reauth");
  assert.equal(fields["Last Error"], "permission expirée");
  assert.equal(Object.hasOwn(fields, "Views"), false);
  assert.equal(Object.hasOwn(fields, "Likes"), false);
  assert.equal(Object.hasOwn(fields, "Reach"), false);
  assert.equal(Object.hasOwn(fields, "Metrics Details JSON"), false);
});

test("Total Interactions est calculé à partir des interactions disponibles si la plateforme ne le fournit pas", () => {
  const fields = buildSocialPerformanceFields({
    key: "instagram:ig-123",
    target,
    metrics: { likes: 10, comments: 2, shares: 3, saves: 4 },
  });
  assert.equal(fields["Total Interactions"], 19);
});

test("les valeurs numériques invalides sont normalisées sans NaN ni Infinity", () => {
  const fields = buildSocialPerformanceFields({
    key: "youtube:abc",
    target: { ...target, provider: "youtube", external_id: "abc" },
    metrics: {
      views: "not-a-number",
      likes: Infinity,
      completion: NaN,
      average_view_duration_seconds: "2.75",
    },
  });
  assert.equal(fields.Views, 0);
  assert.equal(fields.Likes, 0);
  assert.equal(fields["Completion %"], 0);
  assert.equal(fields["Average View Duration Seconds"], 2.75);
});

test("Metrics Details JSON est strictement allowlisté et ne sérialise aucune propriété arbitraire sensible", () => {
  const details = socialMetricsDetails({
    analytics_views: 42,
    analytics_window_days: 365,
    media_type: "VIDEO",
    access_token: "should-never-appear",
    refresh_token: "also-secret",
    arbitrary: "not-allowed",
  });
  const serialized = JSON.stringify(details);
  assert.deepEqual(details, {
    analytics_views: 42,
    analytics_window_days: 365,
    media_type: "VIDEO",
  });
  assert.equal(serialized.includes("should-never-appear"), false);
  assert.equal(serialized.includes("also-secret"), false);
  assert.equal(serialized.includes("arbitrary"), false);
});
