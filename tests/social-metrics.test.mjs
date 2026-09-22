import assert from "node:assert/strict";
import test from "node:test";
import {
  contentMetricTargets,
  normalizeInstagramMetrics,
  normalizeLinkedInMetrics,
  normalizePinterestMetrics,
  normalizeThreadsMetrics,
  normalizeTikTokMetrics,
  normalizeXMetrics,
  normalizeYoutubeMetrics,
  performanceKey,
  selectMetricTargets,
} from "../lib/social-metrics.mjs";

test("normalise YouTube et TikTok sans inventer les métriques absentes", () => {
  const yt = normalizeYoutubeMetrics({ id: "yt123", statistics: { viewCount: "1200", likeCount: "80", commentCount: "12" } });
  assert.equal(yt.views, 1200); assert.equal(yt.likes, 80); assert.equal(yt.shares, 0);
  const tt = normalizeTikTokMetrics({ id: "tt123", view_count: 9000, like_count: 430, comment_count: 22, share_count: 71, share_url: "https://tiktok.com/v/tt123" });
  assert.equal(tt.views, 9000); assert.equal(tt.shares, 71);
});

test("normalise X avec vues vidéo, clics et complétion", () => {
  const result = normalizeXMetrics({ id: "42", public_metrics: { impression_count: 9000, like_count: 90, reply_count: 8, retweet_count: 11, quote_count: 3, bookmark_count: 17 }, non_public_metrics: { url_link_clicks: 41 } }, { public_metrics: { view_count: 6000 }, non_public_metrics: { playback_0_count: 5000, playback_100_count: 1250 } });
  assert.equal(result.views, 6000); assert.equal(result.shares, 14); assert.equal(result.saves, 17); assert.equal(result.clicks, 41); assert.equal(result.completion, 0.25);
});

test("normalise Threads, Instagram et LinkedIn", () => {
  const threads = normalizeThreadsMetrics("th42", [
    { name: "views", values: [{ value: 1000 }] }, { name: "likes", values: [{ value: 50 }] }, { name: "replies", values: [{ value: 7 }] },
    { name: "reposts", values: [{ value: 8 }] }, { name: "quotes", values: [{ value: 2 }] }, { name: "shares", values: [{ value: 3 }] },
  ], { permalink: "https://threads.net/post/th42" });
  assert.equal(threads.comments, 7); assert.equal(threads.shares, 13);
  const instagram = normalizeInstagramMetrics("ig42", [
    { name: "views", values: [{ value: 8000 }] }, { name: "saved", values: [{ value: 19 }] }, { name: "shares", values: [{ value: 33 }] },
  ], { like_count: 440, comments_count: 18, permalink: "https://instagram.com/reel/ig42" });
  assert.equal(instagram.views, 8000); assert.equal(instagram.saves, 19);
  const linkedin = normalizeLinkedInMetrics("urn:li:share:42", { impressionCount: 5000, likeCount: 160, commentCount: 15, shareCount: 12, clickCount: 80 });
  assert.equal(linkedin.clicks, 80); assert.equal(linkedin.views, 5000); assert.equal(linkedin.followers_generated, null); assert.equal(linkedin.saves, null);
});

test("normalise Pinterest à partir du résumé demandé, avec repli lifetime", () => {
  const summary = normalizePinterestMetrics("987654321", {
    organic: {
      summary_metrics: { IMPRESSION: 12000, SAVE: 321, PIN_CLICK: 840, OUTBOUND_CLICK: 190 },
      lifetime_metrics: { IMPRESSION: 99999, SAVE: 9999 },
    },
  });
  assert.equal(summary.views, 12000);
  assert.equal(summary.saves, 321);
  assert.equal(summary.pin_clicks, 840);
  assert.equal(summary.clicks, 190);
  assert.equal(summary.url, "https://www.pinterest.com/pin/987654321/");

  const lifetime = normalizePinterestMetrics("123", { all: { lifetime_metrics: { IMPRESSION: 77, SAVE: 8, PIN_CLICK: 6, OUTBOUND_CLICK: 2 } } });
  assert.equal(lifetime.views, 77);
  assert.equal(lifetime.saves, 8);
  assert.equal(lifetime.clicks, 2);
});

test("une fiche multi-plateforme produit une cible distincte par réseau publié", () => {
  const targets = contentMetricTargets({ id: "recContent123", fields: {
    "ID YouTube": "yt123", "ID TikTok": "tt123", "ID Instagram": "ig123", "ID LinkedIn": "urn:li:share:123", "ID Pinterest": "pin123", "ID X": "123", "ID Threads": "th123",
  } });
  assert.equal(targets.length, 7);
  assert.deepEqual(targets.map((item) => item.provider), ["youtube", "tiktok", "instagram", "linkedin", "pinterest", "x", "threads"]);
});

test("la rotation mesure d'abord les publications jamais mesurées puis les plus anciennes", () => {
  const targets = [
    { provider: "youtube", external_id: "old" },
    { provider: "x", external_id: "never" },
    { provider: "tiktok", external_id: "recent" },
  ];
  const performance = [
    { fields: { "Performance Key": "youtube:old", "Captured At": "2026-09-10T00:00:00Z" } },
    { fields: { "Performance Key": "tiktok:recent", "Captured At": "2026-09-15T09:00:00Z" } },
  ];
  const selected = selectMetricTargets(targets, performance, 3);
  assert.deepEqual(selected.map((item) => item.external_id), ["never", "old", "recent"]);
});

test("la clé de performance est stable par réseau et contenu externe", () => {
  assert.equal(performanceKey("YouTube", " abc "), "youtube:abc");
  assert.notEqual(performanceKey("youtube", "abc"), performanceKey("tiktok", "abc"));
});
