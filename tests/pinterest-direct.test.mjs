import assert from "node:assert/strict";
import test from "node:test";
import { buildPinterestAuthorization, dispatchPinterestPost, pinterestStatus } from "../lib/pinterest-social.mjs";

test("Pinterest OAuth construit le callback canonique et les scopes minimum", () => {
  const env = {
    HIBOU_SOCIAL_VAULT_KEY: "a".repeat(64),
    HIBOU_PUBLIC_BASE_URL: "https://d4d5d6.com",
    PINTEREST_APP_ID: "app-123",
    PINTEREST_APP_SECRET: "secret",
  };
  const auth = buildPinterestAuthorization(env);
  const url = new URL(auth.url);
  assert.equal(auth.provider, "pinterest");
  assert.equal(auth.redirect_uri, "https://d4d5d6.com/api/social/oauth/pinterest/callback");
  assert.equal(url.hostname, "www.pinterest.com");
  assert.match(auth.scopes, /boards:read/);
  assert.match(auth.scopes, /pins:write/);
  assert.match(auth.scopes, /user_accounts:read/);
});

test("Pinterest dry-run image ne nécessite aucun token", async () => {
  const result = await dispatchPinterestPost({
    media_url: "https://example.com/hibou.jpg",
    caption: "Exemple",
    title: "Le Hibou",
    board_id: "board-1",
    dry_run: true,
    metadata: { cta_url: "https://d4d5d6.com/?utm_source=pinterest" },
  }, {});
  assert.equal(result.ok, true);
  assert.equal(result.dry_run, true);
  assert.equal(result.payload.media_type, "image");
  assert.equal(result.payload.board_id, "board-1");
});

test("Pinterest dry-run vidéo exige la cover seulement au passage live", async () => {
  const result = await dispatchPinterestPost({
    media_url: "https://example.com/hibou.mp4",
    caption: "Vidéo",
    title: "Hibou vidéo",
    cover_image_url: "https://example.com/cover.jpg",
    board_id: "board-1",
    dry_run: true,
  }, {});
  assert.equal(result.payload.media_type, "video");
  assert.equal(result.payload.cover_image_url, "https://example.com/cover.jpg");
});

test("Pinterest status n'expose aucun faux état connecté sans OAuth", async () => {
  const result = await pinterestStatus({});
  assert.equal(result.provider, "pinterest");
  assert.equal(result.configured, false);
  assert.equal(result.mode, "unconfigured");
  assert.equal(result.live_publish_supported, false);
});
