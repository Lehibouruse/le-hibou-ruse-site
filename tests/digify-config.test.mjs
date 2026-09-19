import assert from "node:assert/strict";
import test from "node:test";
import {
  DIGIFY_ADD_RECIPIENT_DEFAULT_URL,
  DIGIFY_REVOKE_RECIPIENT_DEFAULT_URL,
  digifyReadiness,
  resolveDigifyWebhookAuth,
} from "../lib/digify-config.mjs";
import { digifyRecipientRequest, digifyRevokeRequest } from "../lib/commerce.mjs";

test("Digify webhook auth is derived from CRON_SECRET when explicit credentials are absent", () => {
  const first = resolveDigifyWebhookAuth({ CRON_SECRET: "root-secret-for-test" });
  const second = resolveDigifyWebhookAuth({ CRON_SECRET: "root-secret-for-test" });
  assert.equal(first.username, "hibou-digify");
  assert.equal(first.source, "derived");
  assert.equal(first.password, second.password);
  assert.equal(first.password.length, 40);
  assert.notEqual(first.password, "root-secret-for-test");
});

test("explicit webhook credentials override derived credentials", () => {
  const auth = resolveDigifyWebhookAuth({
    CRON_SECRET: "root",
    DIGIFY_WEBHOOK_USERNAME: "custom-user",
    DIGIFY_WEBHOOK_PASSWORD: "custom-password",
  });
  assert.deepEqual(auth, { username: "custom-user", password: "custom-password", source: "explicit" });
});

test("partial explicit webhook auth is rejected", () => {
  assert.throws(() => resolveDigifyWebhookAuth({ DIGIFY_WEBHOOK_USERNAME: "only-user" }), /doivent être configurés ensemble/);
});

test("official Digify recipient endpoints are safe built-in defaults", () => {
  const env = {
    DIGIFY_KEY_ID: "key",
    DIGIFY_SECRET: "secret",
  };
  const add = digifyRecipientRequest({ fileGuid: "file-1", email: "buyer@example.com", orderId: "order-1" }, env);
  const remove = digifyRevokeRequest({ fileGuid: "file-1", email: "buyer@example.com", orderId: "order-1" }, env);
  assert.equal(add.url, DIGIFY_ADD_RECIPIENT_DEFAULT_URL);
  assert.equal(remove.url, DIGIFY_REVOKE_RECIPIENT_DEFAULT_URL);
  assert.equal(new URL(add.url).hostname, "svc.digify.com");
  assert.equal(new URL(remove.url).hostname, "svc.digify.com");
});

test("readiness exposes built-in contracts but never secret values", () => {
  const readiness = digifyReadiness({ DIGIFY_KEY_ID: "key-id-value", DIGIFY_SECRET: "secret-value", CRON_SECRET: "root" });
  assert.equal(readiness.credentials_present, true);
  assert.equal(readiness.add_recipient_endpoint, DIGIFY_ADD_RECIPIENT_DEFAULT_URL);
  assert.equal(readiness.revoke_recipient_endpoint, DIGIFY_REVOKE_RECIPIENT_DEFAULT_URL);
  assert.equal(readiness.recipient_contract_builtin, true);
  assert.equal(readiness.revocation_contract_builtin, true);
  assert.equal(readiness.webhook_auth_ready, true);
  assert.equal(JSON.stringify(readiness).includes("secret-value"), false);
  assert.equal(JSON.stringify(readiness).includes("root"), false);
});
