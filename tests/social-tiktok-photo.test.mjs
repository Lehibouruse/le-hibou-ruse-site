import assert from "node:assert/strict";
import test from "node:test";
import { tiktokPhotoPostBody, tiktokPhotoUrls } from "../lib/social-tiktok-photo.mjs";
import { dispatchSocialPost, socialGatewayStatus } from "../lib/social-gateway-complete.mjs";

test("TikTok photo déduplique les URLs et accepte jusqu'à 35 images HTTPS", () => {
  assert.deepEqual(tiktokPhotoUrls({
    media_url: "https://cdn.example.com/a.jpg",
    metadata: { media_urls: ["https://cdn.example.com/a.jpg", "https://cdn.example.com/b.png"] },
  }), ["https://cdn.example.com/a.jpg", "https://cdn.example.com/b.png"]);
  const many = Array.from({ length: 35 }, (_, i) => `https://cdn.example.com/${i}.jpg`);
  assert.equal(tiktokPhotoUrls({ media_url: many[0], metadata: { media_urls: many.slice(1) } }).length, 35);
});

test("TikTok photo refuse HTTP et plus de 35 images", () => {
  assert.throws(() => tiktokPhotoUrls({ media_url: "http://cdn.example.com/a.jpg" }), /HTTPS/);
  const many = Array.from({ length: 36 }, (_, i) => `https://cdn.example.com/${i}.jpg`);
  assert.throws(() => tiktokPhotoUrls({ media_url: many[0], metadata: { media_urls: many.slice(1) } }), /35 images/);
});

test("une app TikTok non auditée force SELF_ONLY et sécurise l'index de couverture", () => {
  const body = tiktokPhotoPostBody({
    media_url: "https://cdn.example.com/a.jpg",
    metadata: { media_urls: ["https://cdn.example.com/b.jpg"], photo_cover_index: 99 },
    privacy_level: "PUBLIC_TO_EVERYONE",
    title: "Titre",
    caption: "Description",
  }, { privacy_level_options: ["PUBLIC_TO_EVERYONE", "SELF_ONLY"] }, { TIKTOK_APP_AUDITED: "false" });
  assert.equal(body.post_info.privacy_level, "SELF_ONLY");
  assert.equal(body.source_info.photo_cover_index, 0);
  assert.equal(body.media_type, "PHOTO");
  assert.equal(body.post_mode, "DIRECT_POST");
  assert.equal(body.source_info.source, "PULL_FROM_URL");
});

test("une app TikTok auditée respecte la confidentialité autorisée", () => {
  const body = tiktokPhotoPostBody({
    media_url: "https://cdn.example.com/a.jpg",
    privacy_level: "PUBLIC_TO_EVERYONE",
  }, { privacy_level_options: ["PUBLIC_TO_EVERYONE", "SELF_ONLY"] }, { TIKTOK_APP_AUDITED: "true" });
  assert.equal(body.post_info.privacy_level, "PUBLIC_TO_EVERYONE");
});

test("le dry-run TikTok photo ne contacte aucun réseau et expose le plan", async () => {
  const previousFetch = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => { called = true; throw new Error("network must not be called"); };
  try {
    const result = await dispatchSocialPost({
      provider: "tiktok",
      media_url: "https://cdn.example.com/a.jpg",
      metadata: { media_type: "photo", media_urls: ["https://cdn.example.com/b.jpg"] },
      caption: "Test",
      dry_run: true,
    }, {});
    assert.equal(called, false);
    assert.equal(result.ok, true);
    assert.equal(result.dry_run, true);
    assert.equal(result.payload.media_type, "photo");
    assert.equal(result.payload.photo_count, 2);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("le statut gateway TikTok annonce vidéo + photo native sans prétendre être configuré", () => {
  const tiktok = socialGatewayStatus({}).find((item) => item.provider === "tiktok");
  assert.equal(tiktok.configured, false);
  assert.equal(tiktok.direct_capabilities.includes("video_native"), true);
  assert.equal(tiktok.direct_capabilities.includes("photo_native"), true);
  assert.equal(tiktok.direct_capabilities.includes("photo_carousel"), true);
});
