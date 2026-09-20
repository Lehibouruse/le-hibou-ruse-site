import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const health = readFileSync(new URL("../lib/social-connection-health.mjs", import.meta.url), "utf8");
const callback = readFileSync(new URL("../app/api/social/oauth/[provider]/callback/route.js", import.meta.url), "utf8");
const watchdog = readFileSync(new URL("../app/api/system-watchdog/route.js", import.meta.url), "utf8");
const connectionTest = readFileSync(new URL("../app/api/social/connection-test/route.js", import.meta.url), "utf8");
const airtable = readFileSync(new URL("../lib/airtable.js", import.meta.url), "utf8");

test("les contrôles OAuth sont strictement des lectures distantes d'identité", () => {
  for (const endpoint of [
    "youtube/v3/channels",
    "v2/user/info",
    "api.x.com/2/users/me",
    "linkedin.com/v2/userinfo",
    "graph.threads.net",
    "graph.instagram.com",
    "api.pinterest.com/v5/user_account",
  ]) assert.ok(health.includes(endpoint), endpoint);
  assert.doesNotMatch(health, /dispatchSocialPost|media_publish|threads_publish|video_reels|pins\s*\/\s*create/);
});

test("un OAuth terminé déclenche immédiatement un read-test avec le même runtime configuré", () => {
  assert.match(callback, /testVaultProviderConnections\(result\.provider, env\)/);
  assert.match(callback, /tested: readOk \? "read_ok" : "read_failed"/);
  assert.match(callback, /socialRuntimeEnv\(configurationMap\(records\), process\.env\)/);
});

test("l'endpoint manuel teste aussi Pinterest sans exposer de secret", () => {
  assert.match(connectionTest, /"pinterest"/);
  assert.match(connectionTest, /read_only_remote_calls: true/);
  assert.match(connectionTest, /secrets_exposed: false/);
  assert.match(connectionTest, /socialRuntimeEnv\(configurationMap\(records\), process\.env\)/);
});

test("le watchdog ne reteste qu’un provider OAuth stale à la fois", () => {
  assert.match(watchdog, /SOCIAL_READ_TEST_MAX_AGE_MS = 6 \* 60 \* 60 \* 1000/);
  assert.match(watchdog, /staleSocialProvider/);
  assert.match(watchdog, /testVaultProviderConnections\(provider, env\)/);
  assert.match(watchdog, /social_read_health_test/);
  assert.match(watchdog, /pinterest: \["Pinterest"\]/);
  assert.match(watchdog, /instagram: \["Instagram"\]/);
});

test("l'état READ_TESTED exige auth et lecture API réussies sans valider publication ou analytics", () => {
  assert.match(health, /"Auth direct OK": true/);
  assert.match(health, /"Lecture API OK": true/);
  assert.match(health, /"État direct": "READ_TESTED"/);
  assert.doesNotMatch(health, /"Publication testée": true/);
  assert.doesNotMatch(health, /"Analytics OK": true/);
});

test("la table Comptes sociaux est enregistrée dans le runtime Airtable", () => {
  assert.match(airtable, /socialAccounts: "tbljG9MzITNILBoHi"/);
});
