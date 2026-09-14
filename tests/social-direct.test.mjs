import assert from "node:assert/strict";
import test from "node:test";
import { socialGatewayStatus } from "../lib/social-gateway.mjs";

test("les providers directs exposent leur état sans révéler les tokens", () => {
  const env = {
    META_ACCESS_TOKEN: "secret-meta",
    INSTAGRAM_BUSINESS_ACCOUNT_ID: "ig-1",
    FACEBOOK_PAGE_ID: "fb-1",
    THREADS_ACCESS_TOKEN: "secret-threads",
    THREADS_USER_ID: "th-1",
    LINKEDIN_ACCESS_TOKEN: "secret-li",
    LINKEDIN_AUTHOR_URN: "urn:li:person:1",
    LINKEDIN_VERSION: "202608",
    X_ACCESS_TOKEN: "secret-x",
    YOUTUBE_ACCESS_TOKEN: "secret-yt",
  };
  const status = socialGatewayStatus(env);
  for (const provider of ["instagram", "facebook", "threads", "linkedin", "x", "youtube"]) {
    const item = status.find((value) => value.provider === provider);
    assert.equal(item.configured, true);
    assert.equal(item.mode, "direct");
    assert.equal(item.direct_capabilities.includes("video_native"), true);
    assert.equal(JSON.stringify(item).includes("secret"), false);
  }
});

test("TikTok direct non audité signale explicitement la contrainte de publication privée", () => {
  const status = socialGatewayStatus({ TIKTOK_ACCESS_TOKEN: "secret-tiktok" });
  const tiktok = status.find((value) => value.provider === "tiktok");
  assert.equal(tiktok.configured, true);
  assert.equal(tiktok.mode, "direct");
  assert.equal(tiktok.constraints.some((value) => value.includes("SELF_ONLY")), true);
  assert.equal(JSON.stringify(tiktok).includes("secret-tiktok"), false);
});

test("Snapchat reste honnêtement bloqué sans accès serveur organique approuvé", () => {
  const status = socialGatewayStatus({});
  const snapchat = status.find((value) => value.provider === "snapchat");
  assert.equal(snapchat.direct_configured, false);
  assert.equal(snapchat.live_publish_supported, false);
  assert.equal(snapchat.missing_direct_env.length > 0, true);
});
