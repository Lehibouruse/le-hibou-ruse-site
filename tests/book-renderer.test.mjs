import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { chapterRank, markdownToBookHtml, renderBookDocument } from "../lib/book-renderer.mjs";

test("le rendu Markdown échappe le HTML avant toute mise en forme", () => {
  const html = markdownToBookHtml("## Scène fictive\n<script>alert(1)</script> **important**");
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<strong>important<\/strong>/);
  assert.match(html, /class="scene"/);
});

test("l'ordre du livre place ouverture, chapitres, annexe puis conclusion", () => {
  assert.ok(chapterRank("Ouverture — X") < chapterRank("1 — X"));
  assert.ok(chapterRank("13 — X") < chapterRank("Annexe — X"));
  assert.ok(chapterRank("Annexe — X") < chapterRank("Conclusion — X"));
});

test("le document contient couverture, sommaire, édition et garde-fous d'impression", () => {
  const html = renderBookDocument({ chapters: [{ fields: { Chapitre: "1 — Exemple", Section: "D4", Version: "V1", "Contenu V1": "## Mécanisme\nTexte." } }], edition: "V1-test", generatedAt: "2026-09-15T00:00:00Z" });
  assert.match(html, /Le guide du/);
  assert.match(html, /SOMMAIRE/);
  assert.match(html, /V1-test/);
  assert.match(html, /@page/);
  assert.match(html, /noindex,nofollow,noarchive/);
});

test("la preview privée exige Basic Auth et interdit l'indexation", () => {
  const route = readFileSync(new URL("../app/api/book-preview/route.js", import.meta.url), "utf8");
  assert.match(route, /BOOK_PREVIEW_PASSWORD/);
  assert.match(route, /WWW-Authenticate/);
  assert.match(route, /X-Robots-Tag/);
  assert.match(route, /Content-Security-Policy/);
  assert.doesNotMatch(route, /searchParams/);
});
