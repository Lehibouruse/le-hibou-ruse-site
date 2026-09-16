import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { sessionId } from "../lib/conversion-client.mjs";

const conversionClient = readFileSync(new URL("../lib/conversion-client.mjs", import.meta.url), "utf8");
const attributionCapture = readFileSync(new URL("../components/AttributionCapture.js", import.meta.url), "utf8");
const trackedLink = readFileSync(new URL("../components/TrackedLink.js", import.meta.url), "utf8");

test("sessionId reste stable uniquement en mémoire pour la page courante", () => {
  const first = sessionId();
  const second = sessionId();
  assert.ok(first.length >= 8);
  assert.equal(second, first);
});

test("attribution et session de conversion n'utilisent aucun stockage navigateur persistant", () => {
  for (const source of [conversionClient, attributionCapture, trackedLink]) {
    assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie/);
  }
  assert.match(conversionClient, /let inMemorySessionId = ""/);
  assert.match(trackedLink, /captureAttribution/);
});
