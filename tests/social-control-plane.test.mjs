import assert from "node:assert/strict";
import test from "node:test";
import { buildSocialControlPlane } from "../lib/social-control-plane.mjs";

const baseEnv = {
  HIBOU_SOCIAL_VAULT_KEY: Buffer.alloc(32, 3).toString("base64url"),
  YOUTUBE_CLIENT_ID: "yt-client",
  YOUTUBE_CLIENT_SECRET: "yt-secret",
};

const youtubeReady = [{
  provider: "youtube",
  ready: true,
  scopes: "https://www.googleapis.com/auth/youtube",
  redirect_uri: "https://le-hibou-ruse-site.vercel.app/api/social/oauth/youtube/callback",
  error: "",
}];

test("un provider prêt côté serveur s'arrête exactement au consentement humain OAuth", () => {
  const snapshot = buildSocialControlPlane({ readiness: youtubeReady, credentials: [], env: baseEnv });
  const youtube = snapshot.providers.find((item) => item.provider === "youtube");
  assert.equal(youtube.server_env_ready, true);
  assert.equal(youtube.phase, "HUMAN_OAUTH_APPROVAL_REQUIRED");
  assert.equal(youtube.ready_for_human_approval, true);
  assert.equal(youtube.oauth_start_path, "/api/social/oauth/youtube/start");
  assert.equal(snapshot.summary.ready_for_human_approval, 1);
  assert.equal(snapshot.safety.oauth_launched, false);
});

test("un secret serveur manquant bloque avant le consentement et son nom seulement est exposé", () => {
  const env = { ...baseEnv, YOUTUBE_CLIENT_SECRET: "" };
  const snapshot = buildSocialControlPlane({ readiness: youtubeReady, credentials: [], env });
  const youtube = snapshot.providers.find((item) => item.provider === "youtube");
  assert.equal(youtube.phase, "SERVER_SECRETS_REQUIRED");
  assert.deepEqual(youtube.missing_env_names, ["YOUTUBE_CLIENT_SECRET"]);
  assert.equal(JSON.stringify(youtube).includes("yt-secret"), false);
});

test("les scopes réellement accordés font passer YouTube à AUTHORIZED", () => {
  const credentials = [{
    provider: "youtube",
    status: "Connected",
    scopes: "https://www.googleapis.com/auth/youtube",
  }];
  const snapshot = buildSocialControlPlane({ readiness: youtubeReady, credentials, env: baseEnv });
  const youtube = snapshot.providers.find((item) => item.provider === "youtube");
  assert.equal(youtube.credential_connected, true);
  assert.equal(youtube.publish_scope_ok, true);
  assert.equal(youtube.analytics_scope_ok, true);
  assert.equal(youtube.phase, "AUTHORIZED");
});

test("Meta expose séparément les fallbacks Instagram et Facebook", () => {
  const env = {
    HIBOU_SOCIAL_VAULT_KEY: Buffer.alloc(32, 4).toString("base64url"),
    META_APP_ID: "meta-id",
    META_APP_SECRET: "meta-secret",
    META_GRAPH_VERSION: "v24.0",
    HIBOU_SOCIAL_INSTAGRAM_WEBHOOK_URL: "https://example.com/ig",
    HIBOU_SOCIAL_FACEBOOK_WEBHOOK_URL: "https://example.com/fb",
  };
  const readiness = [{ provider: "meta", ready: true, scopes: "", redirect_uri: "https://example.com/meta", error: "" }];
  const snapshot = buildSocialControlPlane({ readiness, credentials: [], env });
  const meta = snapshot.providers.find((item) => item.provider === "meta");
  assert.equal(meta.fallback_webhooks.instagram, true);
  assert.equal(meta.fallback_webhooks.facebook, true);
  assert.equal(meta.fallback_configured, true);
  assert.deepEqual(meta.airtable_platforms, ["Instagram", "Facebook"]);
});

test("Snapchat reste explicitement derrière l'approbation produit externe", () => {
  const snapshot = buildSocialControlPlane({ readiness: [], credentials: [], env: {} });
  const snapchat = snapshot.providers.find((item) => item.provider === "snapchat");
  assert.equal(snapchat.manual_only, true);
  assert.equal(snapchat.phase, "EXTERNAL_PRODUCT_APPROVAL_REQUIRED");
  assert.equal(snapchat.ready_for_human_approval, false);
});
