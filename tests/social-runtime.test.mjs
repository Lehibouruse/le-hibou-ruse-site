import assert from "node:assert/strict";
import test from "node:test";
import { configurationMap, socialPolicy, socialRuntimeEnv } from "../lib/social-runtime.mjs";

test("Airtable peut piloter direct/webhook sans modifier les secrets", () => {
  const env = socialRuntimeEnv({
    social_mode_instagram: "direct",
    social_mode_youtube: "webhook",
    social_mode_pinterest: "direct",
    social_mode_x: "invalid",
    social_mode_bluesky: "direct",
  }, { META_ACCESS_TOKEN: "secret" });
  assert.equal(env.HIBOU_SOCIAL_INSTAGRAM_MODE, "direct");
  assert.equal(env.HIBOU_SOCIAL_YOUTUBE_MODE, "webhook");
  assert.equal(env.HIBOU_SOCIAL_PINTEREST_MODE, "direct");
  assert.equal(env.HIBOU_SOCIAL_X_MODE, undefined);
  assert.equal(env.HIBOU_SOCIAL_BLUESKY_MODE, "direct");
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

test("Airtable injecte les scopes, versions et identifiants sociaux non secrets autorisés", () => {
  const base = {
    META_APP_SECRET: "server-secret",
    HIBOU_SOCIAL_VAULT_KEY: "vault-secret",
  };
  const env = socialRuntimeEnv({
    social_oauth_scopes_meta: "pages_show_list,pages_manage_posts,pages_read_engagement,read_insights",
    social_oauth_scopes_instagram: "instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights",
    social_youtube_analytics_lookback_days: "365",
    social_meta_graph_version: "v26.0",
    social_instagram_graph_version: "v26.0",
    social_meta_target_page_id: "1289018694298622",
    social_linkedin_organization_urn: "urn:li:organization:146337938",
    social_linkedin_version: "202608",
    social_tiktok_app_audited: "false",
    social_tiktok_transfer_mode: "FILE_UPLOAD",
    social_pinterest_sandbox: "true",
    social_bluesky_pds_url: "https://bsky.social",
    social_fake_secret: "must-not-be-injected",
  }, base);

  assert.equal(env.META_OAUTH_SCOPES.includes("read_insights"), true);
  assert.equal(env.INSTAGRAM_OAUTH_SCOPES.includes("instagram_business_content_publish"), true);
  assert.equal(env.YOUTUBE_ANALYTICS_LOOKBACK_DAYS, "365");
  assert.equal(env.META_GRAPH_VERSION, "v26.0");
  assert.equal(env.INSTAGRAM_GRAPH_VERSION, "v26.0");
  assert.equal(env.META_TARGET_PAGE_ID, "1289018694298622");
  assert.equal(env.LINKEDIN_ORGANIZATION_URN, "urn:li:organization:146337938");
  assert.equal(env.LINKEDIN_VERSION, "202608");
  assert.equal(env.TIKTOK_APP_AUDITED, "false");
  assert.equal(env.TIKTOK_TRANSFER_MODE, "FILE_UPLOAD");
  assert.equal(env.PINTEREST_SANDBOX, "true");
  assert.equal(env.BLUESKY_PDS_URL, "https://bsky.social");
  assert.equal(env.META_APP_SECRET, "server-secret");
  assert.equal(env.HIBOU_SOCIAL_VAULT_KEY, "vault-secret");
  assert.equal(env.SOCIAL_FAKE_SECRET, undefined);
});
