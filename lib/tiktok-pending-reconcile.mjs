import { fetchTikTokPublishStatus } from "./tiktok-publish-status.mjs";

function clean(value) { return String(value ?? "").trim(); }

function parseNotes(record = {}) {
  const raw = clean(record?.fields?.Notes);
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

export function pendingTikTokJournalFormula() {
  return `AND({Workflow}='HIBOU_SOCIAL_GATEWAY_V1',FIND('"state":"pending_confirmation"',{Notes})>0)`;
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
  return {
    record_id: clean(record?.id),
    provider,
    publish_id: publishId,
    state: clean(notes.state),
    notes,
    valid: provider === "tiktok" && clean(notes.state) === "pending_confirmation" && Boolean(publishId),
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
      reason: "still_processing",
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
    publication_post_id: clean(status.post_id),
    publication_fail_reason: clean(status.fail_reason),
    publication_status_detail: status,
    reconciled_at: now,
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
