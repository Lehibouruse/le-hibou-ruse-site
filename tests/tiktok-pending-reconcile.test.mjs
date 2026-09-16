import assert from "node:assert/strict";
import test from "node:test";
import { pendingTikTokJournalDetails, pendingTikTokJournalFormula, reconcilePendingTikTokJournal, reconcilableTikTokJournalFormula } from "../lib/tiktok-pending-reconcile.mjs";

function record(state = "pending_confirmation", publishId = "pub-1", extra = {}) {
  return {
    id: "rec123",
    fields: {
      Notes: JSON.stringify({
        state,
        provider: "tiktok",
        publish_id: publishId,
        idempotency_key: "hibou:test:1",
        ...extra,
      }),
    },
  };
}

test("la file watchdog couvre pending et premier failed non réconcilié", () => {
  const formula = pendingTikTokJournalFormula();
  assert.equal(formula, reconcilableTikTokJournalFormula());
  assert.match(formula, /HIBOU_SOCIAL_GATEWAY_V1/);
  assert.match(formula, /pending_confirmation/);
  assert.match(formula, /publication_failed/);
  assert.match(formula, /reconciled_at/);
});

test("extrait le publish_id TikTok du journal", () => {
  const details = pendingTikTokJournalDetails(record());
  assert.equal(details.valid, true);
  assert.equal(details.publish_id, "pub-1");
  assert.equal(details.provider, "tiktok");
  assert.equal(details.failure_needs_confirmation, false);
});

test("un failed webhook non confirmé est éligible une fois au polling officiel", () => {
  const details = pendingTikTokJournalDetails(record("publication_failed"));
  assert.equal(details.valid, true);
  assert.equal(details.failure_needs_confirmation, true);
  const alreadyConfirmed = pendingTikTokJournalDetails(record("publication_failed", "pub-1", { reconciled_at: "2026-09-16T08:00:00.000Z" }));
  assert.equal(alreadyConfirmed.valid, false);
});

test("un statut encore PROCESSING ne modifie pas le journal pending", async () => {
  const result = await reconcilePendingTikTokJournal(record(), "token", {
    fetchStatus: async () => ({ status: "PROCESSING_DOWNLOAD", final: false, complete: false, failed: false }),
  });
  assert.equal(result.changed, false);
  assert.equal(result.reason, "still_processing");
  assert.equal(result.fields, undefined);
});

test("un failed webhook contredit par PROCESSING reste à confirmer sans être effacé", async () => {
  const result = await reconcilePendingTikTokJournal(record("publication_failed"), "token", {
    fetchStatus: async () => ({ status: "PROCESSING_DOWNLOAD", final: false, complete: false, failed: false }),
  });
  assert.equal(result.changed, false);
  assert.equal(result.reason, "failure_not_final_at_provider");
});

test("PUBLISH_COMPLETE ferme automatiquement le pending sans republier", async () => {
  const result = await reconcilePendingTikTokJournal(record(), "token", {
    now: "2026-09-16T08:00:00.000Z",
    fetchStatus: async () => ({ status: "PUBLISH_COMPLETE", final: true, complete: true, failed: false, post_id: "post-77", fail_reason: "" }),
  });
  assert.equal(result.changed, true);
  assert.equal(result.state, "published");
  assert.equal(result.fields.Action, "tiktok · published");
  assert.equal(result.fields.Erreur, "");
  const notes = JSON.parse(result.fields.Notes);
  assert.equal(notes.state, "published");
  assert.equal(notes.publication_post_id, "post-77");
  assert.equal(notes.publish_id, "pub-1");
  assert.equal(notes.reconciliation_source, "publish_status_fetch");
});

test("FAILED ferme automatiquement le pending avec le fail_reason", async () => {
  const result = await reconcilePendingTikTokJournal(record(), "token", {
    now: "2026-09-16T08:00:00.000Z",
    fetchStatus: async () => ({ status: "FAILED", final: true, complete: false, failed: true, post_id: "", fail_reason: "video_pull_failed" }),
  });
  assert.equal(result.changed, true);
  assert.equal(result.state, "publication_failed");
  assert.equal(result.fields.Action, "tiktok · publication failed");
  assert.equal(result.fields.Erreur, "video_pull_failed");
  assert.equal(JSON.parse(result.fields.Notes).reconciled_at, "2026-09-16T08:00:00.000Z");
});

test("le polling officiel peut réparer une course webhook failed vers PUBLISH_COMPLETE", async () => {
  const result = await reconcilePendingTikTokJournal(record("publication_failed", "pub-1", {
    publication_fail_reason: "late_failure",
    publication_post_id: "post-old",
  }), "token", {
    now: "2026-09-16T08:02:00.000Z",
    fetchStatus: async () => ({ status: "PUBLISH_COMPLETE", final: true, complete: true, failed: false, post_id: "post-77", fail_reason: "" }),
  });
  assert.equal(result.changed, true);
  assert.equal(result.state, "published");
  assert.equal(result.fields.Erreur, "");
  const notes = JSON.parse(result.fields.Notes);
  assert.equal(notes.publication_fail_reason, "");
  assert.equal(notes.publication_post_id, "post-77");
  assert.equal(notes.reconciled_at, "2026-09-16T08:02:00.000Z");
});

test("un failed confirmé n'est plus repollé indéfiniment", async () => {
  let calls = 0;
  const confirmed = record("publication_failed", "pub-1", { reconciled_at: "2026-09-16T08:00:00.000Z" });
  const result = await reconcilePendingTikTokJournal(confirmed, "token", {
    fetchStatus: async () => { calls += 1; return {}; },
  });
  assert.equal(result.reason, "not_pending_tiktok");
  assert.equal(calls, 0);
});

test("aucun token ou un journal invalide ne provoque d'appel réseau", async () => {
  let calls = 0;
  const fetchStatus = async () => { calls += 1; return {}; };
  const noToken = await reconcilePendingTikTokJournal(record(), "", { fetchStatus });
  const invalid = await reconcilePendingTikTokJournal(record("published"), "token", { fetchStatus });
  assert.equal(noToken.reason, "access_token_missing");
  assert.equal(invalid.reason, "not_pending_tiktok");
  assert.equal(calls, 0);
});
