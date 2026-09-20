import test from "node:test";
import assert from "node:assert/strict";
import { requireTikTokUserToken } from "../lib/social-tiktok-token.mjs";

test("TikTok rejects a 200 response carrying an OAuth error instead of tokens", () => {
  assert.throws(
    () => requireTikTokUserToken({ error: "invalid_client", error_description: "Invalid client secret", log_id: "example" }),
    /TikTok OAuth: réponse sans jeton utilisateur complet.*Invalid client secret.*log_id=example/,
  );
});

test("TikTok requires refresh material before saving a connection", () => {
  assert.throws(() => requireTikTokUserToken({ access_token: "access", open_id: "user", expires_in: 86400 }), /refresh_token/);
  const response = { access_token: "access", refresh_token: "refresh", open_id: "user", expires_in: 86400 };
  assert.equal(requireTikTokUserToken(response), response);
});
