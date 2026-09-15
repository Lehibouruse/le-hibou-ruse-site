import assert from "node:assert/strict";
import test from "node:test";
import { fetchInstagramEnhancedMetrics, normalizeInstagramEnhancedMetrics } from "../lib/social-instagram-metrics.mjs";

function response(status, data, statusText = "") {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    async json() { return data; },
  };
}

const env = {
  META_ACCESS_TOKEN: "secret-instagram-token",
  META_GRAPH_VERSION: "v26.0",
};
const scopes = "pages_read_engagement instagram_manage_insights instagram_basic instagram_content_publish";

test("normalizeInstagramEnhancedMetrics conserve le schéma canonique et les champs insights utiles", () => {
  const metric = normalizeInstagramEnhancedMetrics("ig-1", {
    like_count: 12,
    comments_count: 3,
    permalink: "https://www.instagram.com/p/example/",
    media_type: "VIDEO",
    media_product_type: "REELS",
  }, {
    views: 200,
    reach: 150,
    saved: 7,
    shares: 5,
    total_interactions: 27,
    available_metrics: ["views", "reach", "saved", "shares", "total_interactions"],
  });
  assert.equal(metric.provider, "instagram");
  assert.equal(metric.views, 200);
  assert.equal(metric.likes, 12);
  assert.equal(metric.comments, 3);
  assert.equal(metric.shares, 5);
  assert.equal(metric.saves, 7);
  assert.equal(metric.reach, 150);
  assert.equal(metric.total_interactions, 27);
  assert.equal(metric.media_product_type, "REELS");
  assert.equal(metric.analytics_status, "active");
});

test("une métrique non disponible ne fait plus échouer tous les insights Instagram", async () => {
  const calls = [];
  const fetchImpl = async (input, options = {}) => {
    const url = new URL(String(input));
    calls.push({ url: url.toString(), auth: options.headers?.Authorization || "" });
    if (!url.pathname.endsWith("/insights")) {
      return response(200, {
        id: "ig-2",
        like_count: 10,
        comments_count: 2,
        permalink: "https://www.instagram.com/p/ig2/",
        media_type: "VIDEO",
        media_product_type: "REELS",
      });
    }
    const metric = url.searchParams.get("metric");
    if (metric === "views") return response(400, { error: { message: "metric unavailable for this media" } });
    if (metric === "plays") return response(200, { data: [{ name: "plays", values: [{ value: 120 }] }] });
    if (metric === "reach") return response(200, { data: [{ name: "reach", values: [{ value: 100 }] }] });
    if (metric === "saved") return response(200, { data: [{ name: "saved", values: [{ value: 4 }] }] });
    if (metric === "shares") return response(200, { data: [{ name: "shares", values: [{ value: 5 }] }] });
    if (metric === "total_interactions") return response(400, { error: { message: "not supported" } });
    return response(404, {});
  };

  const metric = await fetchInstagramEnhancedMetrics("ig-2", env, fetchImpl, scopes);
  assert.equal(metric.views, 120);
  assert.equal(metric.reach, 100);
  assert.equal(metric.saves, 4);
  assert.equal(metric.shares, 5);
  assert.equal(metric.total_interactions, 21);
  assert.equal(metric.analytics_status, "active");
  assert.equal(metric.analytics_metrics.includes("plays"), true);
  assert.equal(calls.every((call) => !call.url.includes(env.META_ACCESS_TOKEN)), true);
  assert.equal(calls.every((call) => call.auth === `Bearer ${env.META_ACCESS_TOKEN}`), true);
});

test("un refus 403 d'Instagram Insights remonte needs_reauth", async () => {
  const fetchImpl = async (input) => {
    const url = new URL(String(input));
    if (!url.pathname.endsWith("/insights")) return response(200, { id: "ig-3", like_count: 0, comments_count: 0 });
    return response(403, { error: { message: "permission missing" } }, "Forbidden");
  };
  await assert.rejects(
    () => fetchInstagramEnhancedMetrics("ig-3", env, fetchImpl, scopes),
    (error) => error?.code === "needs_reauth" && /403/.test(error.message),
  );
});

test("instagram_manage_insights manquant bloque les analytics avant tout appel réseau", async () => {
  let called = false;
  const fetchImpl = async () => { called = true; return response(500, {}); };
  await assert.rejects(
    () => fetchInstagramEnhancedMetrics("ig-4", env, fetchImpl, "pages_read_engagement instagram_basic"),
    (error) => error?.code === "needs_reauth" && /instagram_manage_insights/.test(error.message),
  );
  assert.equal(called, false);
});

test("un token éventuellement renvoyé dans une erreur fournisseur est expurgé", async () => {
  const fetchImpl = async () => response(500, { error: { message: `bad token ${env.META_ACCESS_TOKEN}` } });
  await assert.rejects(
    () => fetchInstagramEnhancedMetrics("ig-5", env, fetchImpl, scopes),
    (error) => !error.message.includes(env.META_ACCESS_TOKEN) && error.message.includes("[redacted]"),
  );
});
