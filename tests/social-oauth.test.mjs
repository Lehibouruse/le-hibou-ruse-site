import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildSocialAuthorization, oauthProviderReadiness } from "../lib/social-oauth.mjs";

const base = {
  HIBOU_PUBLIC_BASE_URL: "https://d4d5d6.com",
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
  META_GRAPH_VERSION: "v26.0",
  INSTAGRAM_APP_ID: "ig-id",
  INSTAGRAM_APP_SECRET: "ig-secret",
  INSTAGRAM_GRAPH_VERSION: "v26.0",
  THREADS_APP_ID: "threads-id",
  THREADS_APP_SECRET: "threads-secret",
  PINTEREST_APP_ID: "pin-id",
  PINTEREST_APP_SECRET: "pin-secret",
};

test("les huit providers OAuth exposent un callback HTTPS sur le domaine canonique", () => {
  const readiness = oauthProviderReadiness(base);
  assert.equal(readiness.length, 8);
  assert.equal(readiness.every((item) => item.ready), true);
  assert.equal(readiness.every((item) => item.redirect_uri.startsWith("https://d4d5d6.com/api/social/oauth/")), true);
});

test("YouTube demande l'accès offline sans exposer le client secret", () => {
  const auth = buildSocialAuthorization("youtube", base);
  const url = new URL(auth.url);
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("prompt"), "consent");
  assert.equal(auth.url.includes("yt-secret"), false);
});

test("TikTok utilise Login Kit v2 avec publication et lecture des performances", () => {
  const auth = buildSocialAuthorization("tiktok", base);
  const url = new URL(auth.url);
  assert.match(auth.url, /^https:\/\/www\.tiktok\.com\/v2\/auth\/authorize\//);
  const scopes = new URL(auth.url).searchParams.get("scope") || "";
  assert.match(scopes, /video\.publish/);
  assert.match(scopes, /video\.list/);
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

test("Pinterest prépare OAuth avec les scopes organiques sans exposer le secret", () => {
  const auth = buildSocialAuthorization("pinterest", base);
  const url = new URL(auth.url);
  assert.equal(url.origin, "https://www.pinterest.com");
  assert.match(url.searchParams.get("scope") || "", /pins:write/);
  assert.match(url.searchParams.get("scope") || "", /boards:read/);
  assert.equal(auth.url.includes("pin-secret"), false);
});

test("Meta OAuth peut préparer l'autorisation avec CRON_SECRET comme coffre serveur", () => {
  const env = {
    HIBOU_PUBLIC_BASE_URL: "https://d4d5d6.com",
    CRON_SECRET: "cron-root-secret-long-enough-for-tests",
    META_APP_ID: "meta-id",
    META_APP_SECRET: "meta-secret",
    META_GRAPH_VERSION: "v26.0",
    META_OAUTH_SCOPES: "pages_show_list,pages_manage_posts,pages_read_engagement,read_insights",
  };
  const auth = buildSocialAuthorization("meta", env);
  const url = new URL(auth.url);
  assert.equal(url.origin, "https://www.facebook.com");
  assert.equal(url.pathname, "/v26.0/dialog/oauth");
  assert.equal(url.searchParams.get("redirect_uri"), "https://d4d5d6.com/api/social/oauth/meta/callback");
  assert.match(url.searchParams.get("scope") || "", /pages_manage_posts/);
  assert.doesNotMatch(url.searchParams.get("scope") || "", /instagram_/);
  assert.equal(auth.url.includes("meta-secret"), false);
});

test("Instagram Business Login utilise son propre callback, ses credentials et ses scopes", () => {
  const auth = buildSocialAuthorization("instagram", base);
  const url = new URL(auth.url);
  assert.equal(url.origin, "https://www.instagram.com");
  assert.equal(url.searchParams.get("redirect_uri"), "https://d4d5d6.com/api/social/oauth/instagram/callback");
  assert.match(url.searchParams.get("scope") || "", /instagram_business_basic/);
  assert.match(url.searchParams.get("scope") || "", /instagram_business_content_publish/);
  assert.match(url.searchParams.get("scope") || "", /instagram_business_manage_insights/);
  assert.equal(auth.url.includes("ig-secret"), false);
});

test("les routes OAuth chargent toute la Configuration Airtable, au-delà de 100 enregistrements", () => {
  const paths = [
    "../app/api/social/oauth/[provider]/start/route.js",
    "../app/api/social/oauth/[provider]/callback/route.js",
  ];
  for (const path of paths) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /queryAllRecords\(TABLES\.configuration/);
    assert.doesNotMatch(source, /queryRecords\(TABLES\.configuration/);
  }
});
