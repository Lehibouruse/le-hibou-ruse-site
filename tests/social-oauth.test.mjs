import assert from "node:assert/strict";
import test from "node:test";
import { buildSocialAuthorization, oauthProviderReadiness } from "../lib/social-oauth.mjs";

const base = {
  HIBOU_PUBLIC_BASE_URL: "https://le-hibou-ruse-site.vercel.app",
  HIBOU_SOCIAL_VAULT_KEY: Buffer.alloc(32, 9).toString("base64url"),
  YOUTUBE_CLIENT_ID: "yt-id",
  YOUTUBE_CLIENT_SECRET: "yt-secret",
  TIKTOK_CLIENT_KEY: "tt-id",
  TIKTOK_CLIENT_SECRET: "tt-secret",
  LINKEDIN_CLIENT_ID: "li-id",
  LINKEDIN_CLIENT_SECRET: "li-secret",
  LINKEDIN_VERSION: "202608",
  X_CLIENT_ID: "x-id",
  X_CLIENT_SECRET: "x-secret",
  META_APP_ID: "meta-id",
  META_APP_SECRET: "meta-secret",
  META_GRAPH_VERSION: "v24.0",
  THREADS_APP_ID: "threads-id",
  THREADS_APP_SECRET: "threads-secret",
};

test("les six providers OAuth exposent un callback HTTPS sur le Vercel brandé", () => {
  const readiness = oauthProviderReadiness(base);
  assert.equal(readiness.length, 6);
  assert.equal(readiness.every((item) => item.ready), true);
  assert.equal(readiness.every((item) => item.redirect_uri.startsWith("https://le-hibou-ruse-site.vercel.app/api/social/oauth/")), true);
});

test("YouTube demande l'accès offline sans exposer le client secret", () => {
  const auth = buildSocialAuthorization("youtube", base);
  const url = new URL(auth.url);
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("prompt"), "consent");
  assert.equal(auth.url.includes("yt-secret"), false);
});

test("TikTok utilise Login Kit v2 et les scopes de publication", () => {
  const auth = buildSocialAuthorization("tiktok", base);
  assert.match(auth.url, /^https:\/\/www\.tiktok\.com\/v2\/auth\/authorize\//);
  assert.match(new URL(auth.url).searchParams.get("scope"), /video\.publish/);
});

test("X utilise PKCE et conserve le verifier uniquement dans l'état chiffré", () => {
  const auth = buildSocialAuthorization("x", base);
  const url = new URL(auth.url);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.ok(url.searchParams.get("code_challenge"));
  assert.ok(url.searchParams.get("state"));
  assert.equal(url.searchParams.has("code_verifier"), false);
  assert.equal(auth.url.includes("x-secret"), false);
});

test("le fallback OAuth reste le Vercel brandé si HIBOU_PUBLIC_BASE_URL manque", () => {
  const env = { ...base };
  delete env.HIBOU_PUBLIC_BASE_URL;
  const readiness = oauthProviderReadiness(env);
  assert.equal(readiness.every((item) => item.redirect_uri.startsWith("https://le-hibou-ruse-site.vercel.app/api/social/oauth/")), true);
});
