import test from "node:test";
import assert from "node:assert/strict";
import { buildSocialAppReviewPack } from "../lib/social-app-review-pack.mjs";

const snapshot = { providers: [
  { provider: "youtube", phase: "EXTERNAL_GOOGLE_OAUTH_APP_SETUP_REQUIRED", redirect_uri: "https://le-hibou-ruse-site.vercel.app/api/social/oauth/youtube/callback", missing_publish_scopes: ["youtube.upload"], missing_analytics_scopes: ["yt-analytics.readonly"] },
  { provider: "meta", phase: "EXTERNAL_META_APP_SETUP_REQUIRED", redirect_uri: "https://le-hibou-ruse-site.vercel.app/api/social/oauth/meta/callback" },
  { provider: "instagram", phase: "EXTERNAL_INSTAGRAM_BUSINESS_LOGIN_SETUP_REQUIRED", redirect_uri: "https://le-hibou-ruse-site.vercel.app/api/social/oauth/instagram/callback" },
] };

test("le pack couvre les dix providers d'autorisation/review", () => {
  const pack = buildSocialAppReviewPack(snapshot);
  assert.equal(pack.packs.length, 10);
  for (const provider of ["reddit", "youtube", "meta", "instagram", "tiktok", "linkedin", "pinterest", "threads", "x", "snapchat"]) {
    assert.ok(pack.packs.some((item) => item.provider === provider));
  }
});

test("le callback réel est injecté sans inventer d'approbation", () => {
  const youtube = buildSocialAppReviewPack(snapshot).packs.find((item) => item.provider === "youtube");
  assert.match(youtube.combined_submission_en, /le-hibou-ruse-site\.vercel\.app\/api\/social\/oauth\/youtube\/callback/);
  assert.match(youtube.combined_submission_en, /private/);
  assert.doesNotMatch(youtube.combined_submission_en, /already approved|permission has been approved/i);
});

test("les textes rappellent le chiffrement et n'exposent aucun secret", () => {
  const serialized = JSON.stringify(buildSocialAppReviewPack(snapshot));
  assert.match(serialized, /encrypted at rest/i);
  assert.doesNotMatch(serialized, /CLIENT_SECRET=|ACCESS_TOKEN=|sk-/);
});

test("X interdit explicitement toute dépense automatique", () => {
  const x = buildSocialAppReviewPack(snapshot).packs.find((item) => item.provider === "x");
  assert.match(x.validation_en, /No paid API plan, credit purchase or live test is initiated automatically/);
});
