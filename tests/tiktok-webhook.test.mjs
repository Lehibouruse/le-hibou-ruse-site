import { createHmac } from "node:crypto";
import assert from "node:assert/strict";
import test from "node:test";
import { journalFieldsForTikTokWebhook, parseTikTokWebhook, tikTokWebhookAlreadyApplied, tikTokWebhookEventKey, verifyTikTokWebhookSignature } from "../lib/tiktok-webhook.mjs";

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

test("vérifie la signature HMAC TikTok sur le corps brut", () => {
  const raw = JSON.stringify({ event: "post.publish.complete", content: "{}" });
  const verification = verifyTikTokWebhookSignature(signed(raw), raw, "top-secret", { nowSeconds: 1770000000 });
  assert.equal(verification.ok, true);
  assert.equal(verifyTikTokWebhookSignature(signed(raw), `${raw} `, "top-secret", { nowSeconds: 1770000000 }).ok, false);
});

test("rejette une signature trop ancienne même si le HMAC est correct", () => {
  const raw = "{}";
  const verification = verifyTikTokWebhookSignature(signed(raw, "top-secret", 1000), raw, "top-secret", { nowSeconds: 1401, toleranceSeconds: 300 });
  assert.equal(verification.ok, false);
  assert.equal(verification.reason, "signature_expired");
});

test("parse le content JSON sérialisé des webhooks TikTok", () => {
  const raw = JSON.stringify({
    client_key: "client-1",
    event: "post.publish.failed",
    create_time: 1770000000,
    user_openid: "open-1",
    content: JSON.stringify({ publish_id: "pub-1", reason: "spam_risk", publish_type: "DIRECT_POST" }),
  });
  const event = parseTikTokWebhook(raw);
  assert.equal(event.publish_id, "pub-1");
  assert.equal(event.reason, "spam_risk");
  assert.equal(event.publish_type, "DIRECT_POST");
  assert.equal(tikTokWebhookEventKey(event), "post.publish.failed:pub-1:1770000000");
});

test("post.publish.complete transforme le journal en published", () => {
  const event = { event: "post.publish.complete", publish_id: "pub-1", create_time: 1770000000, publish_type: "DIRECT_POST" };
  const fields = journalFieldsForTikTokWebhook(journal(), event, "2026-09-16T08:00:00.000Z");
  assert.equal(fields.Action, "tiktok · published");
  assert.equal(fields.Erreur, "");
  const notes = JSON.parse(fields.Notes);
  assert.equal(notes.state, "published");
  assert.equal(notes.last_tiktok_webhook.event, "post.publish.complete");
});

test("post.publish.failed conserve le motif sans créer de nouvelle publication", () => {
  const event = { event: "post.publish.failed", publish_id: "pub-1", create_time: 1770000001, reason: "video_pull_failed" };
  const fields = journalFieldsForTikTokWebhook(journal(), event, "2026-09-16T08:00:00.000Z");
  assert.equal(fields.Action, "tiktok · publication failed");
  assert.equal(fields.Erreur, "video_pull_failed");
  assert.equal(JSON.parse(fields.Notes).state, "publication_failed");
});

test("publicly_available ajoute le post_id et la disponibilité publique", () => {
  const event = { event: "post.publish.publicly_available", publish_id: "pub-1", post_id: "post-9", create_time: 1770000002 };
  const fields = journalFieldsForTikTokWebhook(journal(), event, "2026-09-16T08:00:00.000Z");
  const notes = JSON.parse(fields.Notes);
  assert.equal(notes.publication_post_id, "post-9");
  assert.equal(notes.publicly_available, true);
});

test("la même livraison at-least-once est détectée comme doublon", () => {
  const event = { event: "post.publish.complete", publish_id: "pub-1", create_time: 1770000003, publish_type: "DIRECT_POST" };
  const first = journalFieldsForTikTokWebhook(journal(), event, "2026-09-16T08:00:00.000Z");
  const updated = { id: "rec1", fields: { Action: first.Action, Erreur: first.Erreur, Notes: first.Notes } };
  assert.equal(tikTokWebhookAlreadyApplied(updated, event), true);
});
