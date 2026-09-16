import { pollTikTokPublishStatus } from "./tiktok-publish-status.mjs";

function clean(value) { return String(value ?? "").trim(); }
function boundedNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

export function tiktokPublishIdFromDispatch(dispatchResult = {}) {
  return clean(
    dispatchResult?.publish_id
      || dispatchResult?.result?.publish_id
      || dispatchResult?.result?.result?.publish_id,
  );
}

export async function reconcileTikTokDispatch(dispatchResult = {}, accessToken = "", options = {}) {
  if (clean(dispatchResult?.provider).toLowerCase() !== "tiktok") return dispatchResult;
  if (dispatchResult?.dry_run !== false || clean(dispatchResult?.mode).toLowerCase() !== "direct") return dispatchResult;

  const publishId = tiktokPublishIdFromDispatch(dispatchResult);
  const token = clean(accessToken);
  if (!publishId) {
    return {
      ...dispatchResult,
      publication_confirmed: false,
      publication_failed: false,
      publication_pending: true,
      publication_status: "",
      publication_status_error: "publish_id_missing_after_dispatch",
    };
  }
  if (!token) {
    return {
      ...dispatchResult,
      publish_id: publishId,
      publication_confirmed: false,
      publication_failed: false,
      publication_pending: true,
      publication_status: "",
      publication_status_error: "access_token_unavailable_for_confirmation",
    };
  }

  const pollImpl = options.pollImpl || pollTikTokPublishStatus;
  const attempts = boundedNumber(options.attempts, 4, 1, 15);
  const intervalMs = boundedNumber(options.intervalMs, 1500, 250, 5000);
  try {
    const status = await pollImpl(publishId, token, { attempts, intervalMs });
    return {
      ...dispatchResult,
      publish_id: publishId,
      publication_status: clean(status?.status).toUpperCase(),
      publication_confirmed: status?.complete === true,
      publication_failed: status?.failed === true,
      publication_pending: status?.final !== true,
      publication_fail_reason: clean(status?.fail_reason),
      publication_post_id: clean(status?.post_id),
      publication_status_detail: status,
      publication_status_error: "",
    };
  } catch (error) {
    // A status-check failure after TikTok accepted the dispatch must never cause an
    // automatic second publication through fallback/retry. Keep the original
    // publish_id and reconcile it later with publication_status.
    return {
      ...dispatchResult,
      publish_id: publishId,
      publication_confirmed: false,
      publication_failed: false,
      publication_pending: true,
      publication_status: "",
      publication_status_error: clean(error?.message || error).slice(0, 800),
    };
  }
}

export function socialDispatchJournalOutcome(providerInput, result = {}, { fallbackUsed = false } = {}) {
  const provider = clean(providerInput).toLowerCase();
  if (provider === "tiktok" && !fallbackUsed && clean(result?.mode).toLowerCase() === "direct" && result?.dry_run === false) {
    if (result.publication_failed === true) {
      const reason = clean(result.publication_fail_reason) || "TikTok publication failed";
      return {
        state: "publication_failed",
        action: "tiktok · publication failed",
        error: reason,
        retry_policy: "manual_check_then_new_idempotency_key",
      };
    }
    if (result.publication_confirmed === true) {
      return {
        state: "published",
        action: "tiktok · published",
        error: "",
        retry_policy: "do_not_retry",
      };
    }
    if (result.publication_pending === true) {
      return {
        state: "pending_confirmation",
        action: "tiktok · processing",
        error: "",
        retry_policy: "check_publication_status_do_not_redispatch",
      };
    }
  }
  return {
    state: "dispatched",
    action: `${provider} · ${fallbackUsed ? "webhook fallback dispatched" : "dispatched"}`,
    error: "",
    retry_policy: "do_not_retry_without_manual_check",
  };
}
