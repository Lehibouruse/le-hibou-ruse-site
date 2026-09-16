import assert from "node:assert/strict";
import test from "node:test";
import { reconcileTikTokDispatch, socialDispatchJournalOutcome, tiktokPublishIdFromDispatch } from "../lib/tiktok-dispatch-confirmation.mjs";

function directResult(publishId = "pub-1") {
  return {
    ok: true,
    dry_run: false,
    provider: "tiktok",
    mode: "direct",
    result: { provider: "tiktok", publish_id: publishId },
  };
}

test("récupère le publish_id dans les enveloppes du gateway", () => {
  assert.equal(tiktokPublishIdFromDispatch(directResult("pub-video")), "pub-video");
  assert.equal(tiktokPublishIdFromDispatch({ result: { result: { publish_id: "pub-nested" } } }), "pub-nested");
});

test("PUBLISH_COMPLETE devient une publication confirmée", async () => {
  const result = await reconcileTikTokDispatch(directResult(), "token", {
    pollImpl: async () => ({ status: "PUBLISH_COMPLETE", complete: true, failed: false, final: true, post_id: "post-1", fail_reason: "" }),
  });
  assert.equal(result.publication_confirmed, true);
  assert.equal(result.publication_pending, false);
  assert.equal(result.publication_post_id, "post-1");
  assert.deepEqual(socialDispatchJournalOutcome("tiktok", result), {
    state: "published",
    action: "tiktok · published",
    error: "",
    retry_policy: "do_not_retry",
  });
});

test("FAILED est un échec final mais ne déclenche pas de second dispatch automatique", async () => {
  const result = await reconcileTikTokDispatch(directResult(), "token", {
    pollImpl: async () => ({ status: "FAILED", complete: false, failed: true, final: true, fail_reason: "spam_risk", post_id: "" }),
  });
  assert.equal(result.publication_failed, true);
  assert.equal(result.publication_pending, false);
  const outcome = socialDispatchJournalOutcome("tiktok", result);
  assert.equal(outcome.state, "publication_failed");
  assert.equal(outcome.retry_policy, "manual_check_then_new_idempotency_key");
  assert.equal(outcome.error, "spam_risk");
});

test("un traitement non terminé reste pending et doit être réconcilié par publish_id", async () => {
  const result = await reconcileTikTokDispatch(directResult("pub-pending"), "token", {
    pollImpl: async () => ({ status: "PROCESSING_DOWNLOAD", complete: false, failed: false, final: false, polling_exhausted: true }),
  });
  assert.equal(result.publication_confirmed, false);
  assert.equal(result.publication_failed, false);
  assert.equal(result.publication_pending, true);
  assert.equal(result.publish_id, "pub-pending");
  assert.equal(socialDispatchJournalOutcome("tiktok", result).retry_policy, "check_publication_status_do_not_redispatch");
});

test("une panne du status endpoint après acceptation reste pending sans perdre le publish_id", async () => {
  const result = await reconcileTikTokDispatch(directResult("pub-safe"), "token", {
    pollImpl: async () => { throw new Error("TikTok publish status 503: internal_error"); },
  });
  assert.equal(result.publication_pending, true);
  assert.equal(result.publish_id, "pub-safe");
  assert.match(result.publication_status_error, /503/);
  assert.equal(socialDispatchJournalOutcome("tiktok", result).state, "pending_confirmation");
});

test("dry-run et webhook ne sont jamais pollés", async () => {
  let calls = 0;
  const pollImpl = async () => { calls += 1; return {}; };
  const dry = await reconcileTikTokDispatch({ ...directResult(), dry_run: true }, "token", { pollImpl });
  const webhook = await reconcileTikTokDispatch({ ...directResult(), mode: "webhook" }, "token", { pollImpl });
  assert.equal(calls, 0);
  assert.equal(dry.publication_pending, undefined);
  assert.equal(webhook.publication_pending, undefined);
});
