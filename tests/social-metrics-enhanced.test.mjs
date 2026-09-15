import assert from "node:assert/strict";
import test from "node:test";
import {
  contentMetricTargets,
  fetchFacebookMetrics,
  fetchYoutubeEnhancedMetrics,
  mergeYoutubeAnalytics,
  normalizeFacebookMetrics,
} from "../lib/social-metrics-enhanced.mjs";

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

test("normalise les compteurs Facebook enrichis", () => {
  const metrics = normalizeFacebookMetrics("page_123", {
    permalink_url: "https://www.facebook.com/example/posts/123",
    reactions: { summary: { total_count: 17 } },
    comments: { summary: { total_count: 4 } },
    shares: { count: 3 },
  }, {
    views: 200,
    clicks: 9,
    reach: 150,
    analytics_metrics: ["post_media_view", "post_clicks", "post_impressions_unique"],
  });
  assert.equal(metrics.views, 200);
  assert.equal(metrics.likes, 17);
  assert.equal(metrics.comments, 4);
  assert.equal(metrics.shares, 3);
  assert.equal(metrics.clicks, 9);
  assert.equal(metrics.reach, 150);
  assert.equal(metrics.total_interactions, 24);
  assert.equal(metrics.analytics_status, "active");
  assert.deepEqual(metrics.analytics_metrics, ["post_media_view", "post_clicks", "post_impressions_unique"]);
});

test("récupère le post Facebook et utilise des insights best-effort", async () => {
  const fakeFetch = async (url) => {
    const target = String(url);
    if (target.includes("/page_123?") && target.includes("fields=")) return response({
      id: "page_123",
      permalink_url: "https://www.facebook.com/example/posts/123",
      reactions: { summary: { total_count: 8 } },
      comments: { summary: { total_count: 2 } },
      shares: { count: 1 },
    });
    if (target.includes("metric=post_media_view")) return response({ data: [{ name: "post_media_view", values: [{ value: 321 }] }] });
    if (target.includes("metric=post_clicks")) return response({ data: [{ name: "post_clicks", values: [{ value: 12 }] }] });
    if (target.includes("metric=post_impressions_unique")) return response({ data: [{ name: "post_impressions_unique", values: [{ value: 250 }] }] });
    throw new Error(`unexpected ${target}`);
  };
  const metrics = await fetchFacebookMetrics(
    "page_123",
    { FACEBOOK_PAGE_ACCESS_TOKEN: "token", META_GRAPH_VERSION: "v26.0" },
    fakeFetch,
    "pages_read_engagement read_insights pages_show_list",
  );
  assert.equal(metrics.views, 321);
  assert.equal(metrics.clicks, 12);
  assert.equal(metrics.reach, 250);
  assert.equal(metrics.likes, 8);
  assert.equal(metrics.total_interactions, 11);
  assert.equal(metrics.analytics_status, "active");
  assert.deepEqual(metrics.analytics_metrics.sort(), ["post_clicks", "post_impressions_unique", "post_media_view"].sort());
});

test("un insight Facebook retiré peut tomber sur le métrique suivant sans casser le pipeline", async () => {
  const fakeFetch = async (url) => {
    const target = String(url);
    if (target.includes("/page_123?") && target.includes("fields=")) return response({ id: "page_123", comments: { summary: { total_count: 0 } }, reactions: { summary: { total_count: 0 } } });
    const metric = new URL(target).searchParams.get("metric");
    if (metric === "post_impressions_unique") return response({ error: { message: "metric unavailable" } }, 400);
    if (metric === "post_media_view") return response({ error: { message: "metric unavailable" } }, 400);
    if (metric === "post_video_views") return response({ error: { message: "metric unavailable" } }, 400);
    if (metric === "post_impressions") return response({ data: [{ values: [{ value: 44 }] }] });
    if (metric === "post_clicks_by_type") return response({ data: [{ values: [{ value: { link: 4, other: 2 } }] }] });
    if (metric === "post_clicks") return response({ error: { message: "metric unavailable" } }, 400);
    throw new Error(`unexpected ${target}`);
  };
  const metrics = await fetchFacebookMetrics(
    "page_123",
    { META_ACCESS_TOKEN: "token", META_GRAPH_VERSION: "v26.0" },
    fakeFetch,
    "pages_read_engagement read_insights",
  );
  assert.equal(metrics.views, 44);
  assert.equal(metrics.clicks, 6);
  assert.equal(metrics.reach, 0);
  assert.equal(metrics.analytics_status, "active");
  assert.deepEqual(metrics.analytics_metrics.sort(), ["post_clicks_by_type", "post_impressions"].sort());
});

test("Facebook conserve les compteurs du post sans appeler Insights si read_insights manque", async () => {
  const calls = [];
  const fakeFetch = async (url) => {
    const target = String(url);
    calls.push(target);
    if (target.includes("/page_456?") && target.includes("fields=")) return response({
      id: "page_456",
      reactions: { summary: { total_count: 6 } },
      comments: { summary: { total_count: 2 } },
      shares: { count: 1 },
    });
    throw new Error(`Insights ne devait pas être appelé: ${target}`);
  };
  const metrics = await fetchFacebookMetrics(
    "page_456",
    { META_ACCESS_TOKEN: "token", META_GRAPH_VERSION: "v26.0" },
    fakeFetch,
    "pages_read_engagement pages_show_list",
  );
  assert.equal(calls.length, 1);
  assert.equal(metrics.likes, 6);
  assert.equal(metrics.comments, 2);
  assert.equal(metrics.shares, 1);
  assert.equal(metrics.total_interactions, 9);
  assert.equal(metrics.analytics_status, "scope_missing");
  assert.deepEqual(metrics.analytics_metrics, []);
});

test("ajoute Facebook aux cibles de métriques du Content Pipeline", () => {
  const targets = contentMetricTargets({ id: "rec123", fields: { "ID Facebook": "fb-9", "URL Facebook": "https://facebook.example/fb-9" } });
  assert.deepEqual(targets.find((item) => item.provider === "facebook"), { provider: "facebook", external_id: "fb-9", url: "https://facebook.example/fb-9", content_record_id: "rec123" });
});

test("Facebook signale une reconnexion si pages_read_engagement manque", async () => {
  await assert.rejects(() => fetchFacebookMetrics("fb", { META_ACCESS_TOKEN: "token", META_GRAPH_VERSION: "v26.0" }, async () => response({}), "pages_show_list"), (error) => error?.code === "needs_reauth");
});

test("fusionne les métriques YouTube Analytics de rétention avec les compteurs publics", () => {
  const merged = mergeYoutubeAnalytics({
    provider: "youtube", external_id: "vid1", views: 900, likes: 42, comments: 7, shares: 0,
    saves: 0, watch_time_seconds: 0, completion: 0, clicks: 0, followers_generated: 0,
  }, {
    columnHeaders: [
      { name: "views" }, { name: "estimatedMinutesWatched" }, { name: "averageViewDuration" },
      { name: "averageViewPercentage" }, { name: "subscribersGained" }, { name: "shares" },
    ],
    rows: [[850, 125.5, 53.4, 67.25, 11, 9]],
  }, 365);
  assert.equal(merged.views, 900);
  assert.equal(merged.analytics_views, 850);
  assert.equal(merged.watch_time_seconds, 7530);
  assert.equal(merged.average_view_duration_seconds, 53.4);
  assert.equal(merged.completion, 0.6725);
  assert.equal(merged.followers_generated, 11);
  assert.equal(merged.shares, 9);
  assert.equal(merged.analytics_status, "active");
});

test("YouTube enrichit les statistiques via reports.query avec filtre vidéo", async () => {
  const calls = [];
  const fakeFetch = async (url) => {
    const target = String(url);
    calls.push(target);
    if (target.startsWith("https://www.googleapis.com/youtube/v3/videos")) {
      return response({ items: [{ id: "vid1", statistics: { viewCount: "1000", likeCount: "55", commentCount: "8" } }] });
    }
    if (target.startsWith("https://youtubeanalytics.googleapis.com/v2/reports")) {
      const parsed = new URL(target);
      assert.equal(parsed.searchParams.get("ids"), "channel==MINE");
      assert.equal(parsed.searchParams.get("filters"), "video==vid1");
      assert.match(parsed.searchParams.get("metrics"), /averageViewPercentage/);
      return response({
        columnHeaders: [{ name: "views" }, { name: "estimatedMinutesWatched" }, { name: "averageViewDuration" }, { name: "averageViewPercentage" }, { name: "subscribersGained" }, { name: "shares" }],
        rows: [[980, 200, 61, 71, 14, 5]],
      });
    }
    throw new Error(`unexpected ${target}`);
  };
  const scopes = "https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly";
  const metrics = await fetchYoutubeEnhancedMetrics("vid1", { YOUTUBE_ACCESS_TOKEN: "token", YOUTUBE_ANALYTICS_LOOKBACK_DAYS: "180" }, fakeFetch, scopes);
  assert.equal(calls.length, 2);
  assert.equal(metrics.views, 1000);
  assert.equal(metrics.watch_time_seconds, 12000);
  assert.equal(metrics.completion, 0.71);
  assert.equal(metrics.followers_generated, 14);
  assert.equal(metrics.analytics_window_days, 180);
});

test("YouTube conserve les compteurs de base si le rapport Analytics est indisponible", async () => {
  const fakeFetch = async (url) => {
    const target = String(url);
    if (target.startsWith("https://www.googleapis.com/youtube/v3/videos")) return response({ items: [{ id: "vid2", statistics: { viewCount: "12", likeCount: "2", commentCount: "1" } }] });
    if (target.startsWith("https://youtubeanalytics.googleapis.com/v2/reports")) return response({ error: { message: "analytics not enabled" } }, 403);
    throw new Error(`unexpected ${target}`);
  };
  const scopes = "https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly";
  const metrics = await fetchYoutubeEnhancedMetrics("vid2", { YOUTUBE_ACCESS_TOKEN: "token" }, fakeFetch, scopes);
  assert.equal(metrics.views, 12);
  assert.equal(metrics.likes, 2);
  assert.equal(metrics.analytics_status, "unavailable");
  assert.equal(metrics.watch_time_seconds, 0);
});

test("YouTube n'appelle pas Analytics tant que les deux scopes de lecture ne sont pas accordés", async () => {
  let analyticsCalled = false;
  const fakeFetch = async (url) => {
    const target = String(url);
    if (target.startsWith("https://www.googleapis.com/youtube/v3/videos")) return response({ items: [{ id: "vid3", statistics: { viewCount: "4" } }] });
    analyticsCalled = true;
    return response({});
  };
  const metrics = await fetchYoutubeEnhancedMetrics("vid3", { YOUTUBE_ACCESS_TOKEN: "token" }, fakeFetch, "https://www.googleapis.com/auth/youtube.readonly");
  assert.equal(analyticsCalled, false);
  assert.equal(metrics.analytics_status, "scope_missing");
});
