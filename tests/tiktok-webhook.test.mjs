import { createHmac } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";
import { journalFieldsForTikTokWebhook, parseTikTokWebhook, tikTokWebhookAlreadyApplied, tikTokWebhookDisposition, tikTokWebhookEventKey, verifyTikTokWebhookSignature } from "../lib/tiktok-webhook.mjs";

function signed(rawBody, secret = "top-secret", timestamp = 1770000000) {
  const signature = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
  return `t=${timestamp},s=${signature}`;
}

function journal(notes = {}) {
  return {
    id: "rec1",
    fields: {
      Action: "tiktok · processing",
      Erreur: "",
      Notes: JSON.stringify({ state: "pending_confirmation", provider: "tiktok", publish_id: "pub-1", ...notes }),
    },
  };
}

function withFields(record, fields) {
  return { id: record.id, fields: { ...record.fields, ...fields } };
}

test("vérifie la signature HMAC TikTok sur le corps brut", () => {
  const raw = JSON.stringify({ event: "post.publish.complete", content: "{}" });
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
