import assert from "node:assert/strict";
import test from "node:test";
import { pendingTikTokJournalDetails, pendingTikTokJournalFormula, reconcilePendingTikTokJournal } from "../lib/tiktok-pending-reconcile.mjs";

function record(state = "pending_confirmation", publishId = "pub-1") {
  return {
    id: "rec123",
    fields: {
      Notes: JSON.stringify({
        state,
        provider: "tiktok",
        publish_id: publishId,
        idempotency_key: "hibou:test:1",
      }),
    },
  };
}

test("la formule cible seulement le journal social pending_confirmation", () => {
  const formula = pendingTikTokJournalFormula();
  assert.match(formula, /HIBOU_SOCIAL_GATEWAY_V1/);
  assert.match(formula, /pending_confirmation/);
});

test("extrait le publish_id TikTok du journal", () => {
  const details = pendingTikTokJournalDetails(record());
  assert.equal(details.valid, true);
  assert.equal(details.publish_id, "pub-1");
  assert.equal(details.provider, "tiktok");
});

test("un statut encore PROCESSING ne modifie pas le journal", async () => {
  const result = await reconcilePendingTikTokJournal(record(), "token", {
    fetchStatus: async () => ({ status: "PROCESSING_DOWNLOAD", final: false, complete: false, failed: false }),
  });
  assert.equal(result.changed, false);
  assert.equal(result.reason, "still_processing");
  assert.equal(result.fields, undefined);
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
