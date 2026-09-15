import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const text = fs.readFileSync(new URL("../docs/launch-runbook.md", import.meta.url), "utf8");

test("le runbook garde les callbacks sociaux canoniques", () => {
  for (const provider of ["youtube", "meta", "tiktok", "linkedin", "x", "threads"]) {
    assert.match(text, new RegExp(`https://d4d5d6\\.com/api/social/oauth/${provider}/callback`));
  }
});

test("le runbook interdit secrets en clair et faux Snapchat", () => {
  assert.match(text, /aucun jeton en clair/i);
  assert.match(text, /Aucun faux connecteur/i);
});
