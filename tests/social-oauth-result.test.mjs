import assert from "node:assert/strict";
import test from "node:test";
import { oauthPublicResultUrl } from "../lib/social-oauth-result.mjs";

test("OAuth redirige vers une page publique et non vers l'admin protégé", () => {
  const url = oauthPublicResultUrl("https://d4d5d6.com/api/social/oauth/meta/callback", {
    connected: "meta",
    tested: "read_ok",
    synced: "1",
  });
  assert.equal(url.origin, "https://d4d5d6.com");
  assert.equal(url.pathname, "/connexion-sociale");
  assert.equal(url.searchParams.get("connected"), "meta");
  assert.equal(url.searchParams.get("tested"), "read_ok");
  assert.equal(url.searchParams.get("synced"), "1");
  assert.equal(url.pathname.startsWith("/admin"), false);
});

test("les messages OAuth publics sont normalisés et tronqués", () => {
  const url = oauthPublicResultUrl("https://d4d5d6.com/callback", {
    error: "bad\nsecret-looking-message".repeat(30),
  });
  const value = url.searchParams.get("error");
  assert.equal(value.includes("\n"), false);
  assert.ok(value.length <= 180);
});
