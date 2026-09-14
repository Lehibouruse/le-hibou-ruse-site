import assert from "node:assert/strict";
import test from "node:test";
import { configurationMap, socialPolicy, socialRuntimeEnv } from "../lib/social-runtime.mjs";

test("Airtable peut piloter direct/webhook sans modifier les secrets", () => {
  const env = socialRuntimeEnv({
    social_mode_instagram: "direct",
    social_mode_youtube: "webhook",
    social_mode_x: "invalid",
  }, { META_ACCESS_TOKEN: "secret" });
  assert.equal(env.HIBOU_SOCIAL_INSTAGRAM_MODE, "direct");
  assert.equal(env.HIBOU_SOCIAL_YOUTUBE_MODE, "webhook");
  assert.equal(env.HIBOU_SOCIAL_X_MODE, undefined);
  assert.equal(env.META_ACCESS_TOKEN, "secret");
});

test("les garde-fous sociaux restent pilotables depuis Airtable", () => {
  assert.deepEqual(socialPolicy({
    social_gateway_enabled: "TRUE",
    social_test_mode: "TRUE",
    social_publication_requires_review: "TRUE",
    human_review_first_videos: "10",
  }), {
    gateway_enabled: true,
    test_mode: true,
    review_required: true,
    first_videos_review_count: 10,
  });
});

test("configurationMap ignore les entrées explicitement inactives", () => {
  const config = configurationMap([
    { fields: { Clé: "a", Valeur: "1", Actif: true } },
    { fields: { Clé: "b", Valeur: "2", Actif: false } },
  ]);
  assert.deepEqual(config, { a: "1" });
});
