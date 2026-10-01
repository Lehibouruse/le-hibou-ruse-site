import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { currentAttribution, sessionId } from "../lib/conversion-client.mjs";

test("sessionId et attribution restent stables pendant une navigation client", () => {
  const first = currentAttribution({
    search: "?utm_source=youtube&utm_campaign=launch",
    href: "https://d4d5d6.com/?utm_source=youtube&utm_campaign=launch",
    referrer: "https://www.youtube.com/watch?v=1",
  });
  const second = currentAttribution({
    search: "",
    href: "https://d4d5d6.com/achat-guide",
    referrer: "https://d4d5d6.com/guide",
  });
  assert.equal(first.session_id, sessionId());
  assert.equal(second.session_id, first.session_id);
  assert.equal(second.utm_source, "youtube");
  assert.equal(second.utm_campaign, "launch");
  assert.equal(second.landing_page, "/");
  assert.equal(second.referrer, "https://www.youtube.com");
});

test("le suivi n’ajoute ni cookie ni stockage navigateur", () => {
  for (const path of ["../lib/conversion-client.mjs", "../components/AttributionCapture.js", "../components/TrackedLink.js"]) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie/);
  }
  const trackedLink = readFileSync(new URL("../components/TrackedLink.js", import.meta.url), "utf8");
  assert.match(trackedLink, /next\/link/);
});
