import assert from "node:assert/strict";
import test from "node:test";
import {
  contentMetricTargets,
  normalizeInstagramMetrics,
  normalizeLinkedInMetrics,
  normalizeThreadsMetrics,
  normalizeTikTokMetrics,
  normalizeXMetrics,
  normalizeYoutubeMetrics,
  performanceKey,
} from "../lib/social-metrics.mjs";

test("normalise les métriques YouTube sans inventer les métriques absentes", () => {
  const result = normalizeYoutubeMetrics({
    id: "yt123",
    statistics: { viewCount: "1200", likeCount: "80", commentCount: "12" },
  });
  assert.equal(result.views, 1200);
  assert.equal(result.likes, 80);
  assert.equal(result.comments, 12);
  assert.equal(result.shares, 0);
});

test("normalise les métriques TikTok publiques", () => {
  const result = normalizeTikTokMetrics({
    id: "tt123", view_count: 9000, like_count: 430, comment_count: 22, share_count: 71,
    share_url: "https://www.tiktok.com/@hibou/video/tt123",
  });
  assert.equal(result.views, 9000);
  assert.equal(result.likes, 430);
  assert.equal(result.comments, 22);
  assert.equal(result.shares, 71);
  assert.equal(result.external_id, "tt123");
});

test("normalise X avec vues vidéo, clics et complétion lorsqu'ils existent", () => {
  const result = normalizeXMetrics({
    id: "42",
    public_metrics: { impression_count: 9000, like_count: 90, reply_count: 8, retweet_count: 11, quote_count: 3, bookmark_count: 17 },
    non_public_metrics: { url_link_clicks: 41 },
  }, {
    public_metrics: { view_count: 6000 },
    non_public_metrics: { playback_0_count: 5000, playback_100_count: 1250 },
  });
  assert.equal(result.views, 6000);
  assert.equal(result.shares, 14);
  assert.equal(result.saves, 17);
  assert.equal(result.clicks, 41);
  assert.equal(result.completion, 0.25);
});

test("normalise Threads sans confondre réponses et repartages", () => {
  const result = normalizeThreadsMetrics("th42", [
    { name: "views", values: [{ value: 1000 }] },
    { name: "likes", values: [{ value: 50 }] },
    { name: "replies", values: [{ value: 7 }] },
    { name: "reposts", values: [{ value: 8 }] },
    { name: "quotes", values: [{ value: 2 }] },
    { name: "shares", values: [{ value: 3 }] },
  ], { permalink: "https://www.threads.net/@hibou/post/th42" });
  assert.equal(result.views, 1000);
  assert.equal(result.comments, 7);
  assert.equal(result.shares, 13);
  assert.match(result.url, /threads/);
});

test("normalise Instagram Reel avec insights + compteurs media", () => {
  const result = normalizeInstagramMetrics("ig42", [
    { name: "views", values: [{ value: 8000 }] },
    { name: "saved", values: [{ value: 19 }] },
    { name: "shares", values: [{ value: 33 }] },
  ], { like_count: 440, comments_count: 18, permalink: "https://instagram.com/reel/ig42" });
  assert.equal(result.views, 8000);
  assert.equal(result.likes, 440);
  assert.equal(result.comments, 18);
  assert.equal(result.saves, 19);
  assert.equal(result.shares, 33);
});

test("normalise LinkedIn analytics membre", () => {
  const result = normalizeLinkedInMetrics("urn:li:share:42", {
    IMPRESSION: 5000, REACTION: 160, COMMENT: 15, RESHARE: 12, POST_SAVE: 20, LINK_CLICKS: 80, FOLLOWER_GAINED_FROM_CONTENT: 9,
  });
  assert.equal(result.views, 5000);
  assert.equal(result.likes, 160);
  assert.equal(result.comments, 15);
  assert.equal(result.shares, 12);
  assert.equal(result.saves, 20);
  assert.equal(result.clicks, 80);
  assert.equal(result.followers_generated, 9);
});

test("une fiche multi-plateforme produit une cible distincte par réseau publié", () => {
  const targets = contentMetricTargets({
    id: "recContent123",
    fields: {
      "ID YouTube": "yt123", "URL YouTube": "https://youtube.com/shorts/yt123",
      "ID TikTok": "tt123", "URL TikTok": "https://tiktok.com/@hibou/video/tt123",
      "ID Instagram": "ig123", "URL Instagram": "https://instagram.com/reel/ig123",
      "ID LinkedIn": "urn:li:share:123", "URL LinkedIn": "https://linkedin.com/feed/update/urn:li:share:123",
      "ID X": "123", "URL X": "https://x.com/i/web/status/123",
      "ID Threads": "th123", "URL Threads": "https://threads.net/@hibou/post/th123",
    },
  });
  assert.equal(targets.length, 6);
  assert.deepEqual(targets.map((item) => item.provider), ["youtube", "tiktok", "instagram", "linkedin", "x", "threads"]);
  assert.equal(targets.every((item) => item.content_record_id === "recContent123"), true);
});

test("la clé de performance est stable par réseau et contenu externe", () => {
  assert.equal(performanceKey("YouTube", " abc "), "youtube:abc");
  assert.notEqual(performanceKey("youtube", "abc"), performanceKey("tiktok", "abc"));
});
