import assert from "node:assert/strict";
import test from "node:test";
import {
  digifyWebhookAction,
  digifyWebhookFingerprint,
  normalizeDigifyWebhookPayload,
  safeDigifyAccessUrl,
} from "../lib/digify-webhook.mjs";

const base = {
  Type: "View",
  EventTime: "2026-09-18T08:00:00+02:00",
  FileGUID: "file-123",
  FileName: "guide.pdf",
  RecipientUserEmail: "BUYER@EXAMPLE.COM",
  Link: "https://example.digify.com/a/secure",
  AccessType: "QuickAccess",
};

test("les événements View/Print/Download sont normalisés sans dépendre de la casse de l'email", () => {
  for (const type of ["View", "Print", "Download"]) {
    const { event, errors } = normalizeDigifyWebhookPayload({ ...base, Type: type });
    assert.deepEqual(errors, []);
    assert.equal(event.type, type);
    assert.equal(event.email, "buyer@example.com");
    assert.equal(event.eventTime, "2026-09-18T06:00:00.000Z");
    assert.equal(event.fileGuid, "file-123");
  }
});

test("un lien webhook doit rester en HTTPS sur Digify", () => {
  assert.equal(safeDigifyAccessUrl("https://secure.digify.com/x"), "https://secure.digify.com/x");
  assert.equal(safeDigifyAccessUrl("https://digify.com/x"), "https://digify.com/x");
  assert.equal(safeDigifyAccessUrl("http://digify.com/x"), "");
  assert.equal(safeDigifyAccessUrl("https://digify.com.evil.example/x"), "");
  assert.equal(safeDigifyAccessUrl("https://example.com/x"), "");
});

test("les payloads incomplets ou malformés sont rejetables de manière déterministe", () => {
  assert.deepEqual(normalizeDigifyWebhookPayload({ ...base, Type: "Delete" }).errors, ["unsupported_type"]);
  assert.deepEqual(normalizeDigifyWebhookPayload({ ...base, FileGUID: "" }).errors, ["missing_file_guid"]);
  assert.deepEqual(normalizeDigifyWebhookPayload({ ...base, EventTime: "not-a-date" }).errors, ["invalid_event_time"]);
  assert.deepEqual(normalizeDigifyWebhookPayload({ ...base, Link: "https://evil.example/x" }).errors, ["invalid_link"]);
});

test("l'empreinte Digify est stable et change si l'événement change", () => {
  const { event } = normalizeDigifyWebhookPayload(base);
  const same = normalizeDigifyWebhookPayload({ ...base, RecipientUserEmail: "buyer@example.com" }).event;
  const later = normalizeDigifyWebhookPayload({ ...base, EventTime: "2026-09-18T08:00:01+02:00" }).event;
  assert.equal(digifyWebhookFingerprint(event), digifyWebhookFingerprint(same));
  assert.notEqual(digifyWebhookFingerprint(event), digifyWebhookFingerprint(later));
  assert.match(digifyWebhookAction(event), /^View · file-123 · [a-f0-9]{24}$/);
});
