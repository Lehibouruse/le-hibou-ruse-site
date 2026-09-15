import assert from "node:assert/strict";
import test from "node:test";
import {
  contentMetricTargets,
  normalizeTikTokMetrics,
  normalizeYoutubeMetrics,
  performanceKey,
} from "../lib/social-metrics.mjs";

test("normalise les métriques YouTube sans inventer les métriques absentes", () => {
  const result = normalizeYoutubeMetrics({
    id: "yt123",
    statistics: { viewCount: "1200", likeCount: "80", commentCount: "12" },
  });
  assert.deepEqual(result, {
    provider: "youtube", external_id: "yt123", views: 1200, likes: 80, comments: 12, shares: 0, saves: 0,
  });
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

test("une fiche multi-plateforme produit deux cibles séparées", () => {
  const targets = contentMetricTargets({
    id: "recContent123",
    fields: {
      "ID YouTube": "yt123",
      "URL YouTube": "https://youtube.com/shorts/yt123",
      "ID TikTok": "tt123",
      "URL TikTok": "https://tiktok.com/@hibou/video/tt123",
    },
  });
  assert.equal(targets.length, 2);
  assert.deepEqual(targets.map((item) => item.provider), ["youtube", "tiktok"]);
  assert.equal(targets.every((item) => item.content_record_id === "recContent123"), true);
});

test("la clé de performance est stable par réseau et contenu externe", () => {
  assert.equal(performanceKey("YouTube", " abc "), "youtube:abc");
  assert.notEqual(performanceKey("youtube", "abc"), performanceKey("tiktok", "abc"));
});
