import assert from "node:assert/strict";
import test from "node:test";
import { corpusReady, extractD6Cases, nextSpecialTarget, specialQuality } from "../lib/book-finalizer.mjs";

function corpusChapter(i, ready = true) {
  const start = (i - 1) * 5 + 1;
  const end = start + 4;
  return { fields: {
    Chapitre: `${i} — Chapitre ${i}`,
    "Source début": start,
    "Source fin": end,
    "Contenu V1": ready ? `## ${start}. Exemple\n### Niveau D4 / D5 / D6\nD4 — propre\n### La scène\nScène\n### Ce qui peut faire tomber le montage\nRisque\n### Version robuste\nAlternative` : "",
    "Montages couverts": ready ? 5 : 0,
    "QC éditorial": ready ? "review" : "in_progress",
  } };
}

function allRecords() {
  const records = Array.from({ length: 13 }, (_, i) => corpusChapter(i + 1));
  records.push({ fields: { Chapitre: "Ouverture — Voir la règle que les autres ne regardent pas", "Contenu V1": "" } });
  records.push({ fields: { Chapitre: "Annexe — Les lignes rouges : ce qui ressemble à une faille mais devient une fraude", "Contenu V1": "" } });
  records.push({ fields: { Chapitre: "Conclusion — Être agressif sur l’analyse, rigoureux sur les faits", "Contenu V1": "" } });
  return records;
}

test("le finalizer attend 13 chapitres corpus complets", () => {
  const records = allRecords();
  assert.equal(corpusReady(records).ready, true);
  records[4].fields["Montages couverts"] = 4;
  assert.equal(corpusReady(records).ready, false);
});

test("l'ordre spécial est ouverture puis annexe puis conclusion", () => {
  const records = allRecords();
  assert.equal(nextSpecialTarget(records).kind, "opening");
  records.find((r) => r.fields.Chapitre.startsWith("Ouverture —")).fields["Contenu V1"] = "déjà écrit";
  assert.equal(nextSpecialTarget(records).kind, "red_lines");
  records.find((r) => r.fields.Chapitre.startsWith("Annexe — Les lignes rouges")).fields["Contenu V1"] = "déjà écrit";
  assert.equal(nextSpecialTarget(records).kind, "conclusion");
});

test("les cas D6 sont extraits sans transformer tout le chapitre en entrée", () => {
  const chapter = corpusChapter(1);
  chapter.fields["Contenu V1"] = `## 1. Cas rouge\n### La scène\nFiction\n### Niveau D4 / D5 / D6\nD6 — fragile\n### Ce qui peut faire tomber le montage\nSimulation\n### Version robuste\nVersion légale\n\n## 2. Cas propre\n### La scène\nFiction\n### Niveau D4 / D5 / D6\nD4 — solide\n### Ce qui peut faire tomber le montage\nRisque\n### Version robuste\nVersion propre`;
  const cases = extractD6Cases([chapter]);
  assert.equal(cases.length, 1);
  assert.match(cases[0].title, /1\. Cas rouge/);
  assert.match(cases[0].robust, /Version légale/);
});

test("le quality gate refuse les H1 et les textes trop courts", () => {
  const good = "Texte ligne rouge D6 fraude simulation. ".repeat(400);
  assert.equal(specialQuality("red_lines", good).pass, true);
  assert.equal(specialQuality("red_lines", "# Titre\nTrop court").pass, false);
});
