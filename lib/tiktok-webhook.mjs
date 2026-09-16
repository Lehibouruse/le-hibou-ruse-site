import { createHmac, timingSafeEqual } from "node:crypto";

function clean(value) { return String(value ?? "").trim(); }

function equalHex(left, right) {
  const a = Buffer.from(clean(left), "hex");
  const b = Buffer.from(clean(right), "hex");
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

export function verifyTikTokWebhookSignature(signatureHeader, rawBody, clientSecret, options = {}) {
  const header = clean(signatureHeader);
  const secret = clean(clientSecret);
  if (!header) return { ok: false, reason: "signature_missing" };
  if (!secret) return { ok: false, reason: "client_secret_missing" };
  const parts = Object.fromEntries(header.split(",").map((item) => {
    const index = item.indexOf("=");
    return index > 0 ? [clean(item.slice(0, index)), clean(item.slice(index + 1))] : ["", ""];
  }).filter(([key]) => key));
  const timestamp = Number(parts.t);
  const signature = clean(parts.s);
  if (!Number.isFinite(timestamp) || !signature) return { ok: false, reason: "signature_malformed" };
  const nowSeconds = Number(options.nowSeconds ?? Math.floor(Date.now() / 1000));
  const toleranceSeconds = Math.max(30, Math.min(3600, Number(options.toleranceSeconds || 300)));
  if (Math.abs(nowSeconds - timestamp) > toleranceSeconds) return { ok: false, reason: "signature_expired", timestamp };
  const signedPayload = `${parts.t}.${String(rawBody ?? "")}`;
  const expected = createHmac("sha256", secret).update(signedPayload, "utf8").digest("hex");
  if (!equalHex(signature, expected)) return { ok: false, reason: "signature_invalid", timestamp };
  return { ok: true, reason: "", timestamp };
}

export function parseTikTokWebhook(rawBody) {
  const envelope = JSON.parse(String(rawBody || "{}"));
  let content = envelope?.content;
  if (typeof content === "string") {
    try { content = JSON.parse(content); } catch { content = {}; }
  }
  if (!content || typeof content !== "object" || Array.isArray(content)) content = {};
  return {
    client_key: clean(envelope?.client_key),
    event: clean(envelope?.event),
    create_time: Number(envelope?.create_time || 0) || 0,
    user_openid: clean(envelope?.user_openid),
    content,
    publish_id: clean(content.publish_id),
    post_id: clean(content.post_id),
    reason: clean(content.reason || content.fail_reason),
    publish_type: clean(content.publish_type),
  };
}

export function tikTokWebhookEventKey(event = {}) {
  return [clean(event.event), clean(event.publish_id || event.user_openid), String(event.create_time || 0)].join(":");
}

function parseJournalNotes(record = {}) {
  try { return JSON.parse(clean(record?.fields?.Notes) || "{}"); } catch { return {}; }
}

export function tikTokWebhookAlreadyApplied(record, event) {
  const notes = parseJournalNotes(record);
  const last = notes?.last_tiktok_webhook || {};
  return clean(last.event) === clean(event?.event)
    && Number(last.create_time || 0) === Number(event?.create_time || 0)
    && clean(notes.publish_id) === clean(event?.publish_id || notes.publish_id);
}

export function journalFieldsForTikTokWebhook(record, event, now = new Date().toISOString()) {
  const notes = parseJournalNotes(record);
  const eventName = clean(event?.event);
  const publishId = clean(event?.publish_id || notes.publish_id);
  if (!publishId) return null;

  let state = clean(notes.state) || "pending_confirmation";
  let action = clean(record?.fields?.Action) || "tiktok · processing";
  let error = clean(record?.fields?.Erreur);
  let publiclyAvailable = notes.publicly_available;

  if (eventName === "post.publish.complete") {
    state = "published";
    action = "tiktok · published";
    error = "";
  } else if (eventName === "post.publish.failed") {
    state = "publication_failed";
    action = "tiktok · publication failed";
    error = clean(event.reason) || "TikTok publication failed";
  } else if (eventName === "post.publish.publicly_available") {
    state = "published";
    action = "tiktok · publicly available";
    error = "";
    publiclyAvailable = true;
  } else if (eventName === "post.publish.no_longer_publicaly_available") {
    action = "tiktok · no longer publicly available";
    publiclyAvailable = false;
  } else if (eventName === "post.publish.inbox_delivered") {
    action = "tiktok · inbox delivered";
  } else {
    return null;
  }

  const nextNotes = {
    ...notes,
    state,
    publish_id: publishId,
    ...(clean(event.post_id) ? { publication_post_id: clean(event.post_id) } : {}),
    ...(publiclyAvailable === undefined ? {} : { publicly_available: publiclyAvailable }),
    publication_fail_reason: eventName === "post.publish.failed" ? error : clean(notes.publication_fail_reason),
    last_tiktok_webhook: {
      event: eventName,
      create_time: Number(event.create_time || 0) || 0,
      publish_type: clean(event.publish_type),
      received_at: now,
    },
  };
  return {
    Action: action,
    Erreur: error,
    "Dernière exécution": now,
    Notes: JSON.stringify(nextNotes).slice(0, 100000),
  };
}
