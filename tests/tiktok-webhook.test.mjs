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

test("la signature fournit un timestamp de repli pour la clé événement", () => {
  const event = { event: "post.publish.complete", publish_id: "pub-1", create_time: 0, signature_time: 1770000004 };
  assert.equal(tikTokWebhookEventKey(event), "post.publish.complete:pub-1:1770000004");
});

test("post.publish.complete transforme le journal en published", () => {
  const event = { event: "post.publish.complete", publish_id: "pub-1", create_time: 1770000000, publish_type: "DIRECT_POST" };
  const fields = journalFieldsForTikTokWebhook(journal(), event, "2026-09-16T08:00:00.000Z");
  assert.equal(fields.Action, "tiktok · published");
  assert.equal(fields.Erreur, "");
  const notes = JSON.parse(fields.Notes);
  assert.equal(notes.state, "published");
  assert.equal(notes.last_tiktok_webhook.event, "post.publish.complete");
  assert.deepEqual(notes.tiktok_webhook_keys, ["post.publish.complete:pub-1:1770000000"]);
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
  assert.equal(notes.tiktok_availability_event_time, 1770000002);
});

test("la même livraison at-least-once est détectée comme doublon même après un autre événement", () => {
  const complete = { event: "post.publish.complete", publish_id: "pub-1", create_time: 1770000003, publish_type: "DIRECT_POST" };
  const first = journalFieldsForTikTokWebhook(journal(), complete, "2026-09-16T08:00:00.000Z");
  let updated = withFields(journal(), first);
  const publicEvent = { event: "post.publish.publicly_available", publish_id: "pub-1", create_time: 1770000004, post_id: "post-1" };
  updated = withFields(updated, journalFieldsForTikTokWebhook(updated, publicEvent, "2026-09-16T08:00:01.000Z"));
  assert.equal(tikTokWebhookAlreadyApplied(updated, complete), true);
});

test("un failed retardé ne peut jamais rétrograder une publication confirmée", () => {
  const complete = { event: "post.publish.complete", publish_id: "pub-1", create_time: 200 };
  const published = withFields(journal(), journalFieldsForTikTokWebhook(journal(), complete, "2026-09-16T08:00:00.000Z"));
  const delayedFailure = { event: "post.publish.failed", publish_id: "pub-1", create_time: 100, reason: "late_failure" };
  const disposition = tikTokWebhookDisposition(published, delayedFailure);
  assert.equal(disposition.apply, false);
  assert.equal(disposition.reason, "superseded_by_published");
  assert.equal(journalFieldsForTikTokWebhook(published, delayedFailure), null);
});

test("même un failed plus récent ne supprime pas la preuve d'un post déjà créé", () => {
  const complete = { event: "post.publish.complete", publish_id: "pub-1", create_time: 100 };
  const published = withFields(journal(), journalFieldsForTikTokWebhook(journal(), complete));
  const laterFailure = { event: "post.publish.failed", publish_id: "pub-1", create_time: 200, reason: "second_attempt_failed" };
  assert.equal(tikTokWebhookDisposition(published, laterFailure).reason, "superseded_by_published");
});

test("un complete retardé peut au contraire réparer un failed reçu plus récemment", () => {
  const failure = { event: "post.publish.failed", publish_id: "pub-1", create_time: 200, reason: "temporary_view" };
  const failed = withFields(journal(), journalFieldsForTikTokWebhook(journal(), failure));
  const delayedComplete = { event: "post.publish.complete", publish_id: "pub-1", create_time: 100 };
  const fields = journalFieldsForTikTokWebhook(failed, delayedComplete, "2026-09-16T08:01:00.000Z");
  assert.ok(fields);
  assert.equal(fields.Action, "tiktok · published");
  assert.equal(fields.Erreur, "");
  const notes = JSON.parse(fields.Notes);
  assert.equal(notes.state, "published");
  assert.equal(notes.publication_fail_reason, "");
  assert.equal(notes.last_tiktok_webhook.create_time, 200);
  assert.equal(notes.last_tiktok_webhook_received.create_time, 100);
});

test("un événement de disponibilité ancien ne peut pas annuler une information plus récente", () => {
  const publicEvent = { event: "post.publish.publicly_available", publish_id: "pub-1", create_time: 200, post_id: "post-1" };
  let current = withFields(journal(), journalFieldsForTikTokWebhook(journal(), publicEvent));
  const removed = { event: "post.publish.no_longer_publicaly_available", publish_id: "pub-1", create_time: 300 };
  current = withFields(current, journalFieldsForTikTokWebhook(current, removed));
  assert.equal(JSON.parse(current.fields.Notes).publicly_available, false);

  const stalePublic = { event: "post.publish.publicly_available", publish_id: "pub-1", create_time: 250, post_id: "post-1" };
  const disposition = tikTokWebhookDisposition(current, stalePublic);
  assert.equal(disposition.apply, false);
  assert.equal(disposition.reason, "stale_availability");
  assert.equal(journalFieldsForTikTokWebhook(current, stalePublic), null);
});

test("à timestamp égal, no_longer_publicaly_available gagne de façon déterministe", () => {
  const publicEvent = { event: "post.publish.publicly_available", publish_id: "pub-1", create_time: 500, post_id: "post-1" };
  let current = withFields(journal(), journalFieldsForTikTokWebhook(journal(), publicEvent));
  const removed = { event: "post.publish.no_longer_publicaly_available", publish_id: "pub-1", create_time: 500 };
  current = withFields(current, journalFieldsForTikTokWebhook(current, removed));
  assert.equal(JSON.parse(current.fields.Notes).publicly_available, false);
  assert.equal(tikTokWebhookDisposition(current, publicEvent).apply, false);
});
