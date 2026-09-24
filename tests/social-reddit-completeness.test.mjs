import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { encryptSocialCredential, decryptSocialCredential } from "../lib/social-credential-vault.mjs";
import { socialRuntimeEnv } from "../lib/social-runtime.mjs";

test("Reddit can be encrypted in the existing OAuth vault after approval", () => {
  const env={HIBOU_SOCIAL_VAULT_KEY:Buffer.alloc(32,5).toString("base64url")};
  const payload={env:{REDDIT_ACCESS_TOKEN:"secret-access",REDDIT_REFRESH_TOKEN:"secret-refresh"}};
  const sealed=encryptSocialCredential("reddit","primary",payload,env);
  assert.equal(JSON.stringify(sealed).includes("secret-access"),false);
  assert.deepEqual(decryptSocialCredential({
    Provider:"reddit","Account key":"primary",Ciphertext:sealed.ciphertext,IV:sealed.iv,
    "Auth tag":sealed.authTag,"Vault version":sealed.version
  },env),payload);
});

test("Reddit non-secret routing values can come from Airtable configuration", () => {
  const env=socialRuntimeEnv({
    social_mode_reddit:"direct",
    social_oauth_scopes_reddit:"identity read submit",
    social_reddit_subreddit:"hibou_test",
    social_reddit_expected_username:"hibou_test"
  },{});
  assert.equal(env.HIBOU_SOCIAL_REDDIT_MODE,"direct");
  assert.equal(env.REDDIT_OAUTH_SCOPES,"identity read submit");
  assert.equal(env.REDDIT_SUBREDDIT,"hibou_test");
  assert.equal(env.REDDIT_EXPECTED_USERNAME,"hibou_test");
});

test("operational routes know Reddit without removing the external approval gate", () => {
  const connection=readFileSync(new URL("../app/api/social/connection-test/route.js",import.meta.url),"utf8");
  const routing=readFileSync(new URL("../lib/social-routing-airtable.mjs",import.meta.url),"utf8");
  assert.match(connection,/bluesky", "reddit"/);
  assert.match(routing,/reddit: "reddit"/);
});
