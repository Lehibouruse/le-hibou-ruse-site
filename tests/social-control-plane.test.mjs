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
  scopes: "https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly",
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
  assert.equal(youtube.metricool_verified, true);
  assert.equal(youtube.chatgpt_pilotable, true);
  assert.equal(snapshot.summary.ready_for_human_approval, 1);
  assert.equal(snapshot.safety.oauth_launched, false);
  assert.equal(snapshot.safety.paid_api_purchase_triggered, false);
});

test("un secret serveur manquant expose le blocage externe exact sans révéler sa valeur", () => {
  const env = { ...baseEnv, YOUTUBE_CLIENT_SECRET: "" };
  const readiness = [{ ...youtubeReady[0], ready: false, error: "YOUTUBE_CLIENT_SECRET absent" }];
  const snapshot = buildSocialControlPlane({ readiness, credentials: [], env });
  const youtube = snapshot.providers.find((item) => item.provider === "youtube");
  assert.equal(youtube.phase, "EXTERNAL_GOOGLE_OAUTH_APP_SETUP_REQUIRED");
  assert.deepEqual(youtube.missing_env_names, ["YOUTUBE_CLIENT_SECRET"]);
  assert.match(youtube.external_blocker, /Google Cloud/);
  assert.match(youtube.authorization_session_step, /YouTube Data API v3/);
  assert.equal(JSON.stringify(youtube).includes("yt-secret"), false);
});

test("les scopes publication + Analytics font passer YouTube à AUTHORIZED", () => {
  const credentials = [{
    provider: "youtube",
    status: "Connected",
    scopes: "https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly",
  }];
  const snapshot = buildSocialControlPlane({ readiness: youtubeReady, credentials, env: baseEnv });
  const youtube = snapshot.providers.find((item) => item.provider === "youtube");
  assert.equal(youtube.credential_connected, true);
  assert.equal(youtube.publish_scope_ok, true);
  assert.equal(youtube.analytics_scope_ok, true);
  assert.equal(youtube.phase, "AUTHORIZED");
});

test("YouTube distingue publication autorisée et scopes Analytics incomplets", () => {
  const credentials = [{ provider: "youtube", status: "Connected", scopes: "https://www.googleapis.com/auth/youtube" }];
  const snapshot = buildSocialControlPlane({ readiness: youtubeReady, credentials, env: baseEnv });
  const youtube = snapshot.providers.find((item) => item.provider === "youtube");
  assert.equal(youtube.publish_scope_ok, true);
  assert.equal(youtube.analytics_scope_ok, false);
  assert.equal(youtube.phase, "ANALYTICS_SCOPE_REVIEW_REQUIRED");
  assert.deepEqual(youtube.missing_analytics_scopes, [
    "https://www.googleapis.com/auth/youtube.readonly",
    "https://www.googleapis.com/auth/yt-analytics.readonly",
  ]);
});

test("Meta expose séparément les fallbacks Instagram et Facebook et reste pilotable via Metricool", () => {
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
  assert.equal(meta.phase, "HUMAN_OAUTH_APPROVAL_REQUIRED");
  assert.equal(meta.fallback_webhooks.instagram, true);
  assert.equal(meta.fallback_webhooks.facebook, true);
  assert.equal(meta.fallback_configured, true);
  assert.equal(meta.metricool_verified, true);
  assert.deepEqual(meta.airtable_platforms, ["Instagram", "Facebook"]);
});

test("les blocages externes non automatisables sont explicites réseau par réseau", () => {
  const snapshot = buildSocialControlPlane({ readiness: [], credentials: [], env: {} });
  const phases = Object.fromEntries(snapshot.providers.map((item) => [item.provider, item.phase]));
  assert.equal(phases.youtube, "EXTERNAL_GOOGLE_OAUTH_APP_SETUP_REQUIRED");
  assert.equal(phases.meta, "EXTERNAL_META_APP_SETUP_REQUIRED");
  assert.equal(phases.tiktok, "EXTERNAL_TIKTOK_APP_PRODUCT_APPROVAL_REQUIRED");
  assert.equal(phases.linkedin, "EXTERNAL_LINKEDIN_COMMUNITY_MANAGEMENT_ACCESS_REQUIRED");
  assert.equal(phases.pinterest, "EXTERNAL_PINTEREST_TRIAL_ACCESS_APPROVAL_REQUIRED");
  assert.equal(phases.x, "EXTERNAL_X_API_ACCESS_AND_BILLING_APPROVAL_REQUIRED");
  assert.equal(phases.threads, "EXTERNAL_THREADS_APP_SETUP_REQUIRED");
  assert.equal(phases.snapchat, "EXTERNAL_SNAP_PRODUCT_APPROVAL_REQUIRED");
});

test("Snapchat reste explicitement derrière l'approbation produit externe", () => {
  const snapshot = buildSocialControlPlane({ readiness: [], credentials: [], env: {} });
  const snapchat = snapshot.providers.find((item) => item.provider === "snapchat");
  assert.equal(snapchat.manual_only, true);
  assert.equal(snapchat.phase, "EXTERNAL_SNAP_PRODUCT_APPROVAL_REQUIRED");
  assert.equal(snapchat.ready_for_human_approval, false);
  assert.equal(snapchat.metricool_verified, false);
});

test("X ne devient jamais pilotable par simple présence du code tant que l'accès externe n'est pas accordé", () => {
  const snapshot = buildSocialControlPlane({ readiness: [], credentials: [], env: {} });
  const x = snapshot.providers.find((item) => item.provider === "x");
  assert.equal(x.chatgpt_pilotable, false);
  assert.match(x.external_blocker, /aucune dépense automatique/i);
});
