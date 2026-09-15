import assert from "node:assert/strict";
import test from "node:test";
import { adminAuthorized, adminOrServiceAuthorized, serviceAuthorized } from "../lib/admin-auth.mjs";

function requestWithAuthorization(value) {
  return new Request("https://example.test", { headers: value ? { authorization: value } : {} });
}

test("service auth préfère HIBOU_CONTROL_PLANE_SECRET", () => {
  const env = { HIBOU_CONTROL_PLANE_SECRET: "control-secret", CRON_SECRET: "cron-secret" };
  assert.equal(serviceAuthorized(requestWithAuthorization("Bearer control-secret"), env), true);
  assert.equal(serviceAuthorized(requestWithAuthorization("Bearer cron-secret"), env), false);
});

test("service auth retombe sur CRON_SECRET si le secret dédié est absent", () => {
  const env = { CRON_SECRET: "cron-secret" };
  assert.equal(serviceAuthorized(requestWithAuthorization("Bearer cron-secret"), env), true);
  assert.equal(serviceAuthorized(requestWithAuthorization("Bearer nope"), env), false);
});

test("adminOrServiceAuthorized accepte Basic admin ou Bearer service", () => {
  const env = { HIBOU_ADMIN_USER: "hibou", HIBOU_ADMIN_PASSWORD: "pw", HIBOU_CONTROL_PLANE_SECRET: "svc" };
  const basic = Buffer.from("hibou:pw").toString("base64");
  assert.equal(adminAuthorized(requestWithAuthorization(`Basic ${basic}`), env), true);
  assert.equal(adminOrServiceAuthorized(requestWithAuthorization(`Basic ${basic}`), env), true);
  assert.equal(adminOrServiceAuthorized(requestWithAuthorization("Bearer svc"), env), true);
  assert.equal(adminOrServiceAuthorized(requestWithAuthorization("Bearer wrong"), env), false);
});
