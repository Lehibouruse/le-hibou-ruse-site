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

function webhookTime(event = {}) {
  return Number(event.create_time || event.signature_time || 0) || 0;
}

export function tikTokWebhookEventKey(event = {}) {
  return [clean(event.event), clean(event.publish_id || event.user_openid), String(webhookTime(event))].join(":");
}

function parseJournalNotes(record = {}) {
  try { return JSON.parse(clean(record?.fields?.Notes) || "{}"); } catch { return {}; }
}

function eventKeys(notes = {}) {
  return Array.isArray(notes.tiktok_webhook_keys) ? notes.tiktok_webhook_keys.map(clean).filter(Boolean) : [];
}

function availabilityPriority(eventName) {
  if (eventName === "post.publish.no_longer_publicaly_available") return 2;
  if (eventName === "post.publish.publicly_available") return 1;
  return 0;
}

export function tikTokWebhookAlreadyApplied(record, event) {
  const notes = parseJournalNotes(record);
  const key = tikTokWebhookEventKey(event);
  if (eventKeys(notes).includes(key)) return true;
  const last = notes?.last_tiktok_webhook || {};
  return clean(last.event) === clean(event?.event)
    && Number(last.create_time || last.signature_time || 0) === webhookTime(event)
    && clean(notes.publish_id) === clean(event?.publish_id || notes.publish_id);
}

export function tikTokWebhookDisposition(record, event) {
  const notes = parseJournalNotes(record);
  const eventName = clean(event?.event);
  const publishId = clean(event?.publish_id || notes.publish_id);
  const currentPublishId = clean(notes.publish_id);
  if (!publishId) return { apply: false, reason: "publish_id_missing" };
  if (currentPublishId && publishId !== currentPublishId) return { apply: false, reason: "publish_id_mismatch" };
  if (tikTokWebhookAlreadyApplied(record, event)) return { apply: false, reason: "duplicate" };

  const state = clean(notes.state) || "pending_confirmation";
  const incomingTime = webhookTime(event);
  const last = notes?.last_tiktok_webhook || {};
  const lastTime = Number(last.create_time || last.signature_time || 0) || 0;
  const success = eventName === "post.publish.complete" || eventName === "post.publish.publicly_available";

  // A confirmed publication is monotonic. TikTok documents that one publish_id may
  // result in multiple posts for the upload flow, so a later failure notification
  // must not erase evidence that at least one post was successfully created.
  if (eventName === "post.publish.failed" && state === "published") {
    return { apply: false, reason: "superseded_by_published", state, incoming_time: incomingTime, last_time: lastTime };
  }

  const availabilityRank = availabilityPriority(eventName);
  if (availabilityRank) {
    const availabilityTime = Number(notes.tiktok_availability_event_time || 0) || 0;
    const previousAvailability = clean(notes.tiktok_availability_event);
    if (availabilityTime && incomingTime && incomingTime < availabilityTime) {
      return { apply: false, reason: "stale_availability", state, incoming_time: incomingTime, last_time: availabilityTime };
    }
    if (availabilityTime && incomingTime && incomingTime === availabilityTime
      && availabilityPriority(previousAvailability) >= availabilityRank) {
      return { apply: false, reason: "superseded_availability", state, incoming_time: incomingTime, last_time: availabilityTime };
    }
  }

  // Old informational/failure events cannot move the journal backwards. A success
  // is the exception: it may safely upgrade a failure even if delivery was delayed.
  if (lastTime && incomingTime && incomingTime < lastTime && !success) {
    return { apply: false, reason: "stale_event", state, incoming_time: incomingTime, last_time: lastTime };
  }
  return { apply: true, reason: "apply", state, incoming_time: incomingTime, last_time: lastTime };
}

export function journalFieldsForTikTokWebhook(record, event, now = new Date().toISOString()) {
  const notes = parseJournalNotes(record);
  const disposition = tikTokWebhookDisposition(record, event);
  if (!disposition.apply) return null;

  const eventName = clean(event?.event);
  const publishId = clean(event?.publish_id || notes.publish_id);
  const incomingTime = webhookTime(event);
  const last = notes?.last_tiktok_webhook || {};
  const lastTime = Number(last.create_time || last.signature_time || 0) || 0;

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

  const key = tikTokWebhookEventKey(event);
  const keys = [...eventKeys(notes).filter((item) => item !== key), key].slice(-20);
  const received = {
    event: eventName,
    create_time: Number(event.create_time || 0) || 0,
    signature_time: Number(event.signature_time || 0) || 0,
    publish_type: clean(event.publish_type),
    received_at: now,
  };
  const chronologicalLast = !lastTime || !incomingTime || incomingTime >= lastTime ? received : last;
  const availabilityRank = availabilityPriority(eventName);
  const success = eventName === "post.publish.complete" || eventName === "post.publish.publicly_available";

  const nextNotes = {
    ...notes,
    state,
    publish_id: publishId,
    ...(clean(event.post_id) ? { publication_post_id: clean(event.post_id) } : {}),
    ...(publiclyAvailable === undefined ? {} : { publicly_available: publiclyAvailable }),
    publication_fail_reason: eventName === "post.publish.failed" ? error : success ? "" : clean(notes.publication_fail_reason),
    tiktok_webhook_keys: keys,
    last_tiktok_webhook: chronologicalLast,
    last_tiktok_webhook_received: received,
    ...(availabilityRank ? {
      tiktok_availability_event: eventName,
      tiktok_availability_event_time: incomingTime,
    } : {}),
  };
  return {
    Action: action,
    Erreur: error,
    "Dernière exécution": now,
    Notes: JSON.stringify(nextNotes).slice(0, 100000),
  };
}
