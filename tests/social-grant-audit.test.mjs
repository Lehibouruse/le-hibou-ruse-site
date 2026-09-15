import assert from "node:assert/strict";
import test from "node:test";
import { auditSocialGrants, scopeSet, socialGrantSummary } from "../lib/social-grant-audit.mjs";

const ready = ["youtube", "tiktok", "meta", "linkedin", "pinterest", "x", "threads"].map((provider) => ({
  provider,
  ready: true,
  redirect_uri: `https://le-hibou-ruse-site.vercel.app/api/social/oauth/${provider}/callback`,
}));

test("scopeSet accepte les scopes OAuth séparés par espaces ou virgules", () => {
  const scopes = scopeSet("pins:read,pins:write boards:read");
  assert.equal(scopes.has("pins:read"), true);
  assert.equal(scopes.has("pins:write"), true);
  assert.equal(scopes.has("boards:read"), true);
});

test("Pinterest devient pleinement autorisé avec lecture analytics et publication", () => {
  const audit = auditSocialGrants(ready, [{
    provider: "pinterest",
    status: "Connected",
    scopes: "boards:read boards:write pins:read pins:write user_accounts:read",
  }]);
  const pinterest = audit.find((item) => item.provider === "pinterest");
  assert.equal(pinterest.app_ready, true);
  assert.equal(pinterest.credential_connected, true);
  assert.equal(pinterest.authorization_ready, true);
  assert.equal(pinterest.fully_ready, true);
  assert.deepEqual(pinterest.missing_publish_scopes, []);
});

test("un OAuth connecté mais incomplet ne peut pas être présenté comme autorisé", () => {
  const audit = auditSocialGrants(ready, [{ provider: "meta", status: "Connected", scopes: "pages_read_engagement" }]);
  const meta = audit.find((item) => item.provider === "meta");
  assert.equal(meta.credential_connected, true);
  assert.equal(meta.publish_scope_ok, false);
  assert.equal(meta.authorization_ready, false);
  assert.deepEqual(meta.missing_publish_scopes.sort(), ["instagram_content_publish", "pages_manage_posts"].sort());
});

test("YouTube accepte le couple least-privilege upload + readonly", () => {
  const audit = auditSocialGrants(ready, [{
    provider: "youtube",
    status: "Connected",
    scopes: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
  }]);
  const youtube = audit.find((item) => item.provider === "youtube");
  assert.equal(youtube.authorization_ready, true);
  assert.equal(youtube.fully_ready, true);
});

test("Snapchat reste explicitement manuel tant que l'accès produit Snap n'est pas accordé", () => {
  const audit = auditSocialGrants(ready, []);
  const snapchat = audit.find((item) => item.provider === "snapchat");
  assert.equal(snapchat.manual_only, true);
  assert.equal(snapchat.authorization_ready, false);
  const summary = socialGrantSummary(audit);
  assert.equal(summary.oauth_providers, 7);
  assert.deepEqual(summary.manual_only, ["snapchat"]);
});
