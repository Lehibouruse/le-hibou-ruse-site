import { fetchTikTokPublishStatus } from "./tiktok-publish-status.mjs";

function clean(value) { return String(value ?? "").trim(); }

function parseNotes(record = {}) {
  const raw = clean(record?.fields?.Notes);
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

export function reconcilableTikTokJournalFormula() {
  return `AND({Workflow}='HIBOU_SOCIAL_GATEWAY_V1',OR(FIND('"state":"pending_confirmation"',{Notes})>0,AND(FIND('"state":"publication_failed"',{Notes})>0,FIND('"reconciled_at":',{Notes})=0)))`;
}

// Legacy name kept because the watchdog already imports it. The queue now also
// contains first-time webhook failures that need one authoritative status check.
export function pendingTikTokJournalFormula() {
  return reconcilableTikTokJournalFormula();
}

export function pendingTikTokJournalDetails(record = {}) {
  const notes = parseNotes(record);
  const provider = clean(notes.provider).toLowerCase();
  const publishId = clean(
    notes.publish_id
      || notes?.result?.publish_id
      || notes?.result?.result?.publish_id
      || notes?.result?.result?.result?.publish_id,
  );
  const state = clean(notes.state);
  const failureNeedsConfirmation = state === "publication_failed" && !clean(notes.reconciled_at);
  return {
    record_id: clean(record?.id),
    provider,
    publish_id: publishId,
    state,
    notes,
    failure_needs_confirmation: failureNeedsConfirmation,
    valid: provider === "tiktok" && Boolean(publishId) && (state === "pending_confirmation" || failureNeedsConfirmation),
  };
}

export async function reconcilePendingTikTokJournal(record, accessToken, options = {}) {
  const details = pendingTikTokJournalDetails(record);
  if (!details.valid) return { changed: false, reason: "not_pending_tiktok", ...details };
  const token = clean(accessToken);
  if (!token) return { changed: false, reason: "access_token_missing", ...details };

  const fetchStatus = options.fetchStatus || fetchTikTokPublishStatus;
  const status = await fetchStatus(details.publish_id, token);
  if (!status?.final) {
    return {
      changed: false,
      reason: details.failure_needs_confirmation ? "failure_not_final_at_provider" : "still_processing",
      ...details,
      status,
    };
  }

  const now = options.now || new Date().toISOString();
  const nextState = status.complete === true ? "published" : "publication_failed";
  const nextNotes = {
    ...details.notes,
    state: nextState,
    publication_status: clean(status.status),
    publication_post_id: clean(status.post_id) || clean(details.notes.publication_post_id),
    publication_fail_reason: status.complete === true ? "" : clean(status.fail_reason),
    publication_status_detail: status,
    reconciled_at: now,
    reconciliation_source: "publish_status_fetch",
  };
  const fields = {
    Action: status.complete === true ? "tiktok · published" : "tiktok · publication failed",
    Erreur: status.failed === true ? (clean(status.fail_reason) || "TikTok publication failed") : "",
    "Dernière exécution": now,
    Notes: JSON.stringify(nextNotes).slice(0, 100000),
  };
  return {
    changed: true,
    reason: nextState,
    ...details,
    state: nextState,
    status,
    fields,
  };
}
