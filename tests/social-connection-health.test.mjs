import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const health = readFileSync(new URL("../lib/social-connection-health.mjs", import.meta.url), "utf8");
const callback = readFileSync(new URL("../app/api/social/oauth/[provider]/callback/route.js", import.meta.url), "utf8");
const watchdog = readFileSync(new URL("../app/api/system-watchdog/route.js", import.meta.url), "utf8");

test("les contrôles OAuth sont strictement en lecture", () => {
  for (const endpoint of ["youtube/v3/channels", "v2/user/info", "api.x.com/2/users/me", "linkedin.com/v2/userinfo", "graph.threads.net/v1.0/me"]) {
    assert.ok(health.includes(endpoint));
  }
  assert.doesNotMatch(health, /dispatchSocialPost|media_publish|threads_publish|\/tweets\"\s*,\s*\{\s*method:\s*\"POST\"/);
});

test("un OAuth terminé déclenche immédiatement un read-test", () => {
  assert.match(callback, /testVaultProviderConnections/);
  assert.match(callback, /tested: readOk \? "read_ok" : "read_failed"/);
});

test("le watchdog ne reteste qu’un provider OAuth stale à la fois", () => {
  assert.match(watchdog, /SOCIAL_READ_TEST_MAX_AGE_MS = 6 \* 60 \* 60 \* 1000/);
  assert.match(watchdog, /staleSocialProvider/);
  assert.match(watchdog, /testVaultProviderConnections\(provider\)/);
  assert.match(watchdog, /social_read_health_test/);
});

test("l'état READ_TESTED exige auth et lecture API réussies sans valider la publication", () => {
  assert.match(health, /"Auth direct OK": true/);
  assert.match(health, /"Lecture API OK": true/);
  assert.match(health, /"État direct": "READ_TESTED"/);
  assert.doesNotMatch(health, /"Publication testée": true/);
  assert.doesNotMatch(health, /"Analytics OK": true/);
});
