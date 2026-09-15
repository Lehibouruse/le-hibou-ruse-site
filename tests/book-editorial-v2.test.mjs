import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { BOOK_EDITORIAL_VERSION, bookInstructions } from "../lib/book-editorial.mjs";

test("le contrat V2 impose les blocs éditoriaux premium", () => {
  const prompt = bookInstructions({ part: "1" });
  assert.equal(BOOK_EDITORIAL_VERSION, "HIBOU_BOOK_EDITORIAL_V2");
  for (const heading of ["La scène", "Ce qui se passe vraiment", "Le mécanisme", "Ce que dit la règle", "Le gain potentiel", "Niveau D4 / D5 / D6", "Ce qui peut faire tomber le montage", "À vérifier", "Version robuste"]) {
    assert.match(prompt, new RegExp(heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(prompt, /Œil du Hibou/);
  assert.match(prompt, /Ne répète JAMAIS le titre du chapitre en H1/);
});

test("une partie suivante n'ajoute pas une nouvelle introduction", () => {
  const prompt = bookInstructions({ part: "2" });
  assert.match(prompt, /N'ajoute aucune nouvelle introduction de chapitre/);
});

test("la ligne rouge reste explicitement non opérationnelle", () => {
  const prompt = bookInstructions({ part: "1" });
  assert.match(prompt, /ne doivent jamais devenir des tutoriels/);
  assert.match(prompt, /Ne donne jamais de procédure pour contourner un contrôle/);
});

test("le scheduler sait remplacer une V1 et exclut le verbatim du prompt", () => {
  const route = readFileSync(new URL("../app/api/book-scheduler/route.js", import.meta.url), "utf8");
  assert.match(route, /replace_existing === true/);
  assert.match(route, /Version: "V2-draft"/);
  assert.match(route, /Contenu original \(verbatim\)/);
  assert.match(route, /hibou-book-editorial-v2/);
});
