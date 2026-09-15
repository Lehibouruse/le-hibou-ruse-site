import assert from "node:assert/strict";
import test from "node:test";
import { publicationFields, publicationResult } from "../lib/social-publication.mjs";

test("normalise les identifiants directs des principaux réseaux", () => {
  assert.deepEqual(publicationResult("youtube", { result: { video_id: "yt42" } }), {
    provider: "youtube", id: "yt42", url: "https://www.youtube.com/watch?v=yt42",
  });
  assert.equal(publicationResult("instagram", { result: { media_id: "ig42", permalink: "https://instagram.com/reel/x" } }).id, "ig42");
  assert.equal(publicationResult("facebook", { result: { video_id: "fb42" } }).id, "fb42");
  assert.equal(publicationResult("linkedin", { result: { post_id: "urn:li:share:42" } }).id, "urn:li:share:42");
  assert.equal(publicationResult("x", { result: { post_id: "42" } }).url, "https://x.com/i/web/status/42");
  assert.equal(publicationResult("threads", { result: { thread_id: "th42" } }).id, "th42");
});

test("mappe chaque publication vers les champs Airtable provider-specific", () => {
  assert.deepEqual(publicationFields("instagram", { result: { media_id: "ig42", permalink: "https://instagram.com/reel/x" } }).fields, {
    "ID Instagram": "ig42",
    "URL Instagram": "https://instagram.com/reel/x",
  });
  assert.deepEqual(publicationFields("x", { result: { post_id: "42" } }).fields, {
    "ID X": "42",
    "URL X": "https://x.com/i/web/status/42",
  });
});

test("ne crée pas de faux identifiant si le provider ne renvoie rien", () => {
  const result = publicationFields("threads", { result: {} });
  assert.equal(result.id, "");
  assert.equal(result.reason, "external_id_absent");
  assert.deepEqual(result.fields, {});
});
