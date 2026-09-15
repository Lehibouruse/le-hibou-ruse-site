import assert from "node:assert/strict";
import test from "node:test";
import { contentMetricTargets, fetchFacebookMetrics, normalizeFacebookMetrics } from "../lib/social-metrics-enhanced.mjs";

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

test("normalise les compteurs Facebook", () => {
  const metrics = normalizeFacebookMetrics("page_123", {
    permalink_url: "https://www.facebook.com/example/posts/123",
    reactions: { summary: { total_count: 17 } },
    comments: { summary: { total_count: 4 } },
    shares: { count: 3 },
  }, { views: 200, clicks: 9 });
  assert.equal(metrics.views, 200);
  assert.equal(metrics.likes, 17);
  assert.equal(metrics.comments, 4);
  assert.equal(metrics.shares, 3);
  assert.equal(metrics.clicks, 9);
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
    throw new Error(`unexpected ${target}`);
  };
  const metrics = await fetchFacebookMetrics("page_123", { FACEBOOK_PAGE_ACCESS_TOKEN: "token", META_GRAPH_VERSION: "v26.0" }, fakeFetch, "pages_read_engagement pages_show_list");
  assert.equal(metrics.views, 321);
  assert.equal(metrics.clicks, 12);
  assert.equal(metrics.likes, 8);
});

test("un insight Facebook retiré peut tomber sur le métrique suivant sans casser le pipeline", async () => {
  const fakeFetch = async (url) => {
    const target = String(url);
    if (target.includes("/page_123?") && target.includes("fields=")) return response({ id: "page_123", comments: { summary: { total_count: 0 } }, reactions: { summary: { total_count: 0 } } });
    if (target.includes("metric=post_media_view")) return response({ error: { message: "metric unavailable" } }, 400);
    if (target.includes("metric=post_video_views")) return response({ error: { message: "metric unavailable" } }, 400);
    if (target.includes("metric=post_impressions")) return response({ data: [{ values: [{ value: 44 }] }] });
    // Vérifier la variante la plus spécifique avant le préfixe générique :
    // "metric=post_clicks" est aussi une sous-chaîne de "metric=post_clicks_by_type".
    if (target.includes("metric=post_clicks_by_type")) return response({ data: [{ values: [{ value: { link: 4, other: 2 } }] }] });
    if (target.includes("metric=post_clicks")) return response({ error: { message: "metric unavailable" } }, 400);
    throw new Error(`unexpected ${target}`);
  };
  const metrics = await fetchFacebookMetrics("page_123", { META_ACCESS_TOKEN: "token", META_GRAPH_VERSION: "v26.0" }, fakeFetch, "pages_read_engagement");
  assert.equal(metrics.views, 44);
  assert.equal(metrics.clicks, 6);
});

test("ajoute Facebook aux cibles de métriques du Content Pipeline", () => {
  const targets = contentMetricTargets({ id: "rec123", fields: { "ID Facebook": "fb-9", "URL Facebook": "https://facebook.example/fb-9" } });
  assert.deepEqual(targets.find((item) => item.provider === "facebook"), { provider: "facebook", external_id: "fb-9", url: "https://facebook.example/fb-9", content_record_id: "rec123" });
});

test("Facebook signale une reconnexion si pages_read_engagement manque", async () => {
  await assert.rejects(() => fetchFacebookMetrics("fb", { META_ACCESS_TOKEN: "token", META_GRAPH_VERSION: "v26.0" }, async () => response({}), "pages_show_list"), (error) => error?.code === "needs_reauth");
});
