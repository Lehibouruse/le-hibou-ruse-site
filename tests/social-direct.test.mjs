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
    X_ACCESS_TOKEN: "secret-x",
    YOUTUBE_ACCESS_TOKEN: "secret-yt",
  };
  const status = socialGatewayStatus(env);
  for (const provider of ["instagram", "facebook", "threads", "linkedin", "x", "youtube"]) {
    const item = status.find((value) => value.provider === provider);
    assert.equal(item.configured, true);
    assert.equal(item.mode, "direct");
    assert.equal(JSON.stringify(item).includes("secret"), false);
  }
});
