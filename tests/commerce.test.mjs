import assert from "node:assert/strict";
import test from "node:test";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { digifyRecipientRequest, digifyRevokeRequest, lemonOrder, verifyLemonSignature } from "../lib/commerce.mjs";

test("la signature Lemon est vérifiée en HMAC SHA-256 sur le body brut", () => {
  const body = Buffer.from('{"meta":{"event_name":"order_created"}}');
  const secret = "unit-test-secret";
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  assert.equal(verifyLemonSignature(body, signature, secret), true);
  assert.equal(verifyLemonSignature(body, "0".repeat(64), secret), false);
});

test("une commande Lemon est normalisée sans dépendre de son nom public", () => {
  const order = lemonOrder({ meta: { event_name: "order_created" }, data: { id: "42", attributes: { user_email: "TEST@EXAMPLE.COM", currency: "EUR", total: 2900, status: "paid", first_order_item: { product_id: 9, variant_id: 10, product_name: "Guide" } } } });
  assert.equal(order.id, "42");
  assert.equal(order.email, "test@example.com");
  assert.equal(order.total, 29);
  assert.equal(order.variantId, "10");
});

test("le corps Digify est fourni par le schéma officiel configuré et exige email + file GUID", () => {
  const request = digifyRecipientRequest({ fileGuid: "file-1", email: "buyer@example.com", orderId: "order-1" }, {
    DIGIFY_KEY_ID: "key",
    DIGIFY_SECRET: "secret",
    DIGIFY_ADD_RECIPIENT_BODY_TEMPLATE: JSON.stringify({ FileGUID: "{{file_guid}}", RecipientEmail: "{{email}}", Reference: "{{order_id}}" }),
  });
  assert.equal(request.url, "https://api.digify.com/v1/file/recipient/add");
  assert.equal(request.body.FileGUID, "file-1");
  assert.equal(request.body.RecipientEmail, "buyer@example.com");
});

test("le pipeline refuse de deviner le schéma Digify", () => {
  assert.throws(() => digifyRecipientRequest({ fileGuid: "f", email: "e@x.com", orderId: "o" }, { DIGIFY_KEY_ID: "key", DIGIFY_SECRET: "secret" }), /BODY_TEMPLATE absent/);
});

test("la révocation Digify est configurable mais verrouillée sur api.digify.com", () => {
  const env = {
    DIGIFY_KEY_ID: "key",
    DIGIFY_SECRET: "secret",
    DIGIFY_REVOKE_RECIPIENT_URL: "https://api.digify.com/v1/example/revoke",
    DIGIFY_REVOKE_RECIPIENT_BODY_TEMPLATE: JSON.stringify({ FileGUID: "{{file_guid}}", RecipientEmail: "{{email}}", Reference: "{{order_id}}" }),
  };
  const request = digifyRevokeRequest({ fileGuid: "file-1", email: "buyer@example.com", orderId: "order-1" }, env);
  assert.equal(new URL(request.url).hostname, "api.digify.com");
  assert.equal(request.body.RecipientEmail, "buyer@example.com");
  assert.throws(() => digifyRevokeRequest({ fileGuid: "f", email: "e@x.com", orderId: "o" }, { ...env, DIGIFY_REVOKE_RECIPIENT_URL: "https://example.com/revoke" }), /Endpoint Digify refusé/);
});

test("la révocation reste inactive tant que l'endpoint et le template officiels ne sont pas configurés", () => {
  assert.throws(() => digifyRevokeRequest({ fileGuid: "f", email: "e@x.com", orderId: "o" }, { DIGIFY_KEY_ID: "key", DIGIFY_SECRET: "secret" }), /REVOKE_RECIPIENT_URL absent/);
});

test("le webhook Lemon et les processeurs Digify sont séparés", () => {
  const lemon = readFileSync(new URL("../app/api/commerce/lemon-webhook/route.js", import.meta.url), "utf8");
  const delivery = readFileSync(new URL("../app/api/commerce/delivery/route.js", import.meta.url), "utf8");
  const revoke = readFileSync(new URL("../app/api/commerce/revoke/route.js", import.meta.url), "utf8");
  assert.match(lemon, /LEMON_SQUEEZY_WEBHOOK_SECRET/);
  assert.match(lemon, /revocation_pending/);
  assert.doesNotMatch(lemon, /revokeDigifyRecipient/);
  assert.match(delivery, /addDigifyRecipient/);
  assert.match(revoke, /revokeDigifyRecipient/);
  assert.match(revoke, /revocation_not_configured/);
});

test("le scheduler interroge livraison et révocation sans bloquer le Core", () => {
  const workflow = readFileSync(new URL("../.github/workflows/hibou-wake.yml", import.meta.url), "utf8");
  assert.match(workflow, /api\/commerce\/delivery/);
  assert.match(workflow, /api\/commerce\/revoke/);
  assert.match(workflow, /\|\| true/);
  assert.match(workflow, /app\/api\/commerce\/\*\*/);
});
