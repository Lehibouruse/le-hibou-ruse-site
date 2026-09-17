import test from "node:test";
import assert from "node:assert/strict";
import { resolveLemonWebhookSecret } from "../lib/commerce.mjs";

test("explicit Lemon webhook secret always wins", () => {
  const secret = resolveLemonWebhookSecret({
    LEMON_SQUEEZY_WEBHOOK_SECRET: " dedicated-secret ",
    CRON_SECRET: "root-secret",
  });
  assert.equal(secret, "dedicated-secret");
});

test("webhook secret is derived deterministically from CRON_SECRET when dedicated secret is absent", () => {
  const one = resolveLemonWebhookSecret({ CRON_SECRET: "root-secret" });
  const two = resolveLemonWebhookSecret({ CRON_SECRET: "root-secret" });
  assert.equal(one, two);
  assert.equal(one.length, 40);
  assert.notEqual(one, "root-secret");
  assert.match(one, /^[A-Za-z0-9_-]{40}$/);
});

test("different root secrets derive different Lemon webhook secrets", () => {
  assert.notEqual(
    resolveLemonWebhookSecret({ CRON_SECRET: "root-a" }),
    resolveLemonWebhookSecret({ CRON_SECRET: "root-b" }),
  );
});

test("missing both secrets remains fail-closed", () => {
  assert.equal(resolveLemonWebhookSecret({}), "");
});
