import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { chapterContent, chapterRank, markdownToBookHtml, publishedBookChapters, renderBookDocument } from "../lib/book-renderer.mjs";

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
  assert.match(html, /href="#chapter-1"/);
  assert.match(html, /id="sommaire"/);
  assert.match(html, /data-reader-title="1 — Exemple"/);
  assert.match(html, /--reader-font-size:17\.5px/);
  assert.match(html, /overflow-wrap:anywhere/);
  assert.match(html, /Retour au sommaire/);
  assert.match(html, /Contenu pédagogique et informatif\. Les règles évoluent\./);
  assert.doesNotMatch(html, /class="folio"|Le Hibou Rusé · V1-test/);
});

test("le lecteur acheté sert le texte principal et la suite, sans sections vides ni doublon", () => {
  const chapters = [
    { fields: { Chapitre: "1 — Principal", Version: "V2-draft", "Contenu V1": "Texte principal.\n\n## À VÉRIFIER\nVérification nécessaire.", "Contenu V1 — suite": "Suite technique unique." } },
    { fields: { Chapitre: "2 — Suite seule", "Contenu V1 — suite": "Seule suite disponible." } },
    { fields: { Chapitre: "3 — Vide", "Contenu V1": "  " } },
    { fields: { Chapitre: "4 — Répétition", "Contenu V1": "Texte déjà présent.", "Contenu V1 — suite": "Texte déjà présent." } },
  ];
  assert.equal(chapterContent(chapters[3].fields), "Texte déjà présent.");
  const html = renderBookDocument({ chapters, edition: "V1.0-early-access-2026-09", generatedAt: "2026-09-30T00:00:00Z", publishedReader: true });
  assert.match(html, /Suite technique unique/);
  assert.match(html, /Seule suite disponible/);
  assert.match(html, /À VÉRIFIER/);
  assert.doesNotMatch(html, /V2-draft/);
  assert.match(html, /consultée le 2026-09-30/);
  assert.match(html, /sans nouvel achat/);
  assert.doesNotMatch(html, /3 — Vide|Chapitre en cours de génération|preview privée/);
  assert.equal(html.match(/Texte déjà présent/g)?.length, 1);
  const updated = renderBookDocument({ chapters, edition: "V1.0-early-access-2026-09", publishedReader: true, updatedSincePurchase: true });
  assert.match(updated, /mis à jour depuis votre achat/);
});

test("la suite technique du chapitre 10 suit le texte principal dans une seule entrée du lecteur", () => {
  const chapters = [
    { fields: { Chapitre: "10 — Collectifs — suite technique", "Contenu V1": "Suite technique propre." } },
    { fields: { Chapitre: "10 — Collectifs", Version: "brouillon", "Contenu V1": "Texte principal." } },
    { fields: { Chapitre: "Charte graphique canonique", "Contenu V1": "Référentiel interne." } },
  ];
  const published = publishedBookChapters(chapters);
  assert.equal(published.length, 1);
  assert.equal(chapterContent(published[0].fields), "Texte principal.\n\nSuite technique propre.");
  const html = renderBookDocument({ chapters, edition: "V1.0-early-access-2026-09", publishedReader: true });
  assert.equal(html.match(/<section class="chapter"/g)?.length, 1);
  assert.doesNotMatch(html, /Référentiel interne|brouillon/);
});

test("la preview privée exige Basic Auth et interdit l'indexation", () => {
  const route = readFileSync(new URL("../app/api/book-preview/route.js", import.meta.url), "utf8");
  assert.match(route, /BOOK_PREVIEW_PASSWORD/);
  assert.match(route, /WWW-Authenticate/);
  assert.match(route, /X-Robots-Tag/);
  assert.match(route, /Content-Security-Policy/);
  assert.doesNotMatch(route, /searchParams/);
});
