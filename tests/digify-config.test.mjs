import assert from "node:assert/strict";
import test from "node:test";
import { DIGIFY_ADD_RECIPIENT_DEFAULT_URL, digifyReadiness, resolveDigifyWebhookAuth } from "../lib/digify-config.mjs";
import { digifyRecipientRequest } from "../lib/commerce.mjs";

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

test("official add-recipient endpoint is the safe default", () => {
  const env = {
    DIGIFY_KEY_ID: "key",
    DIGIFY_SECRET: "secret",
    DIGIFY_ADD_RECIPIENT_BODY_TEMPLATE: JSON.stringify({ FileGUID: "{{file_guid}}", RecipientEmail: "{{email}}" }),
  };
  const request = digifyRecipientRequest({ fileGuid: "file-1", email: "buyer@example.com", orderId: "order-1" }, env);
  assert.equal(request.url, DIGIFY_ADD_RECIPIENT_DEFAULT_URL);
  assert.equal(request.body.FileGUID, "file-1");
});

test("readiness exposes booleans but never secret values", () => {
  const readiness = digifyReadiness({ DIGIFY_KEY_ID: "key-id-value", DIGIFY_SECRET: "secret-value", CRON_SECRET: "root" });
  assert.equal(readiness.credentials_present, true);
  assert.equal(readiness.add_recipient_endpoint, DIGIFY_ADD_RECIPIENT_DEFAULT_URL);
  assert.equal(readiness.webhook_auth_ready, true);
  assert.equal(JSON.stringify(readiness).includes("secret-value"), false);
  assert.equal(JSON.stringify(readiness).includes("root"), false);
});
