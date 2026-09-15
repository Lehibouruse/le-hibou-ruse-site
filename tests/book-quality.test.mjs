import assert from "node:assert/strict";
import test from "node:test";
import { bookQualityGate, REQUIRED_HEADINGS } from "../lib/book-quality.mjs";

function montage(number) {
  const sections = REQUIRED_HEADINGS.map((heading) => `### ${heading}\n\n${heading === "À vérifier" ? "**[À VÉRIFIER]** lorsque la source ne suffit pas. " : ""}${"Explication claire et spécifique au montage. ".repeat(8)}`).join("\n\n");
  return `## ${number}. Un titre qui accroche sans promettre l'impossible\n\n${sections}`;
}

function completeBookPart(count = 2) {
  return `Ouverture éditoriale. ${"Le Hibou montre l'angle utile sans transformer l'optimisation en promesse magique. ".repeat(10)}\n\n${Array.from({ length: count }, (_, index) => montage(index + 1)).join("\n\n---\n\n")}`;
}

test("un lot complet V2 passe le quality gate", () => {
  const qc = bookQualityGate(completeBookPart(2), { expectedMontages: 2, firstPart: true });
  assert.equal(qc.pass, true);
  assert.equal(qc.montageCount, 2);
  assert.equal(qc.h1Count, 0);
  for (const heading of REQUIRED_HEADINGS) assert.equal(qc.headingCounts[heading], 2);
});

test("un montage manquant bloque l'écriture", () => {
  const qc = bookQualityGate(completeBookPart(1), { expectedMontages: 2, firstPart: true });
  assert.equal(qc.pass, false);
  assert.ok(qc.failures.some((value) => value.includes("montages=1/2")));
});

test("une rubrique obligatoire manquante bloque l'écriture", () => {
  const text = completeBookPart(1).replace("### Version robuste", "### Conclusion libre");
  const qc = bookQualityGate(text, { expectedMontages: 1, firstPart: true });
  assert.equal(qc.pass, false);
  assert.ok(qc.failures.some((value) => value.includes("Version robuste=0/1")));
});

test("un H1 généré par le modèle est refusé pour éviter le doublon de maquette", () => {
  const qc = bookQualityGate(`# Chapitre parasite\n\n${completeBookPart(1)}`, { expectedMontages: 1, firstPart: true });
  assert.equal(qc.pass, false);
  assert.ok(qc.failures.some((value) => value.includes("H1 parasite=1")));
});
