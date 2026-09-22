import test from "node:test";
import assert from "node:assert/strict";
import { dispatchSocialPost, socialGatewayStatus } from "../lib/social-gateway.mjs";

test("social gateway reports configured webhook without exposing secrets", () => {
  const env = {
    HIBOU_SOCIAL_YOUTUBE_WEBHOOK_URL: "https://example.com/youtube",
    HIBOU_SOCIAL_WEBHOOK_SECRET: "super-secret",
  };
  const status = socialGatewayStatus(env);
  const youtube = status.find((item) => item.provider === "youtube");
  assert.equal(youtube.configured, true);
  assert.equal(youtube.mode, "webhook");
  assert.equal(JSON.stringify(status).includes("super-secret"), false);
});

test("direct mode can be preferred over an existing webhook during migration", () => {
  const env = {
    HIBOU_SOCIAL_INSTAGRAM_WEBHOOK_URL: "https://example.com/instagram",
    HIBOU_SOCIAL_INSTAGRAM_MODE: "direct",
    INSTAGRAM_ACCESS_TOKEN: "secret-instagram",
    INSTAGRAM_BUSINESS_ACCOUNT_ID: "1784",
  };
  const instagram = socialGatewayStatus(env).find((item) => item.provider === "instagram");
  assert.equal(instagram.mode, "direct");
  assert.equal(instagram.direct_configured, true);
  assert.equal(instagram.webhook_configured, true);
  assert.deepEqual(instagram.direct_capabilities, ["video_native"]);
  assert.equal(JSON.stringify(instagram).includes("secret-instagram"), false);
});

test("provider diagnostics name missing environment variables but never values", () => {
  const youtube = socialGatewayStatus({}).find((item) => item.provider === "youtube");
  assert.equal(youtube.configured, false);
  assert.ok(youtube.missing_direct_env[0].includes("YOUTUBE_ACCESS_TOKEN"));
});

test("dry-run validates and returns a publish plan without network access", async () => {
  const result = await dispatchSocialPost({
    provider: "tiktok",
    media_url: "https://example.com/video.mp4",
    caption: "Test Hibou",
    dry_run: true,
  }, {});
  assert.equal(result.ok, true);
  assert.equal(result.dry_run, true);
  assert.equal(result.provider, "tiktok");
  assert.equal(result.payload.media_url, "https://example.com/video.mp4");
});

test("social gateway refuses non-HTTPS media URLs", async () => {
  await assert.rejects(
    dispatchSocialPost({ provider: "youtube", media_url: "http://example.com/video.mp4", dry_run: true }, {}),
    /HTTPS/,
  );
});


test("Pinterest utilise l API directe avant le webhook en mode auto et reste en dry-run", async () => {
  const env = {
    PINTEREST_ACCESS_TOKEN: "pin-token",
    PINTEREST_BOARD_ID: "12345",
    HIBOU_SOCIAL_PINTEREST_WEBHOOK_URL: "https://example.com/pinterest",
  };
  const status = socialGatewayStatus(env).find((item) => item.provider === "pinterest");
  assert.equal(status.mode, "direct");
  assert.deepEqual(status.direct_capabilities, ["image_native"]);
  assert.equal(status.constraints.some((value) => value.includes("sandbox_image_only")), true);
  assert.equal(JSON.stringify(status).includes("pin-token"), false);
  const plan = await dispatchSocialPost({ provider: "pinterest", media_url: "https://example.com/image.png", caption: "Test", metadata: { media_type: "image" }, dry_run: true }, env);
  assert.equal(plan.dry_run, true);
  assert.equal(plan.gateway.mode, "direct");
  await assert.rejects(
    dispatchSocialPost({ provider: "pinterest", media_url: "https://example.com/video.mp4", caption: "Test", dry_run: true }, env),
    /Sandbox ne permet pas les video Pins/,
  );
});


test("Bluesky direct fonctionne sans app développeur ni OAuth tiers", async () => {
  const env = {
    BLUESKY_IDENTIFIER: "lehibouruse.bsky.social",
    BLUESKY_APP_PASSWORD: "app-password-secret",
  };
  const status = socialGatewayStatus(env).find((item) => item.provider === "bluesky");
  assert.equal(status.configured, true);
  assert.equal(status.mode, "direct");
  assert.deepEqual(status.direct_capabilities, ["text_native", "image_native"]);
  assert.equal(JSON.stringify(status).includes("app-password-secret"), false);

  const plan = await dispatchSocialPost({
    provider: "bluesky",
    caption: "Test Hibou",
    dry_run: true,
  }, env);
  assert.equal(plan.ok, true);
  assert.equal(plan.dry_run, true);
  assert.equal(plan.payload.media_url, "");
});
