import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const mentions = readFileSync(new URL("../app/mentions-legales/page.js", import.meta.url), "utf8");
const privacy = readFileSync(new URL("../app/confidentialite/page.js", import.meta.url), "utf8");
const cgv = readFileSync(new URL("../app/cgv/page.js", import.meta.url), "utf8");
const home = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");

test("les mentions légales early-access restent factuelles sur la structure non encore immatriculée", () => {
  assert.match(mentions, /Version en vigueur/);
  assert.match(mentions, /LLC\) de droit du Nouveau-Mexique/i);
  assert.match(mentions, /en cours de formation et non encore immatriculée/i);
  assert.match(mentions, /ne signifie pas qu’une personne morale existe déjà/i);
  assert.match(mentions, /contact@d4d5d6\.fr/);
  assert.match(mentions, /hébergé par <strong>Vercel Inc\./);
  assert.match(mentions, /Lemon Squeezy/);
  assert.doesNotMatch(mentions, /\[(?:DÉNOMINATION|adresse|numéro|médiateur)/i);
});

test("la politique de confidentialité identifie les prestataires essentiels et un canal d'exercice des droits", () => {
  for (const item of ["Vercel", "Airtable", "Lemon Squeezy", "Digify", "CNIL"]) assert.match(privacy, new RegExp(item));
  assert.match(privacy, /Version en vigueur/);
  assert.match(privacy, /Le Hibou Rusé, LLC de droit du Nouveau-Mexique.*en cours de formation/i);
  assert.match(privacy, /contact@d4d5d6\.fr/);
  assert.match(privacy, /ne stocke pas les numéros complets de carte bancaire/i);
});

test("les CGV early-access décrivent la V1 évolutive et préservent les droits impératifs du contenu numérique", () => {
  assert.match(cgv, /Version en vigueur/);
  assert.match(cgv, /V1 en cours d’enrichissement/i);
  assert.match(cgv, /LLC de droit du Nouveau-Mexique/i);
  assert.match(cgv, /29 €/);
  assert.match(cgv, /Merchant of Record/);
  assert.match(cgv, /consentement exprès/i);
  assert.match(cgv, /reconnaissance de la perte du droit/i);
  assert.match(cgv, /support durable/i);
  assert.match(cgv, /aucun droit général de rétractation de 14 jours ne subsiste/i);\n  assert.match(cgv, /pas de politique commerciale de remboursement volontaire/i);
  assert.match(cgv, /Aucune clause des présentes ne limite un droit impératif/i);
  assert.match(cgv, /contact@d4d5d6\.fr/);
});

test("la landing expose un lien CGV et divulgue le caractère early-access lorsque le checkout est actif", () => {
  assert.match(home, /href="\/cgv"/);
  assert.match(home, /Version partielle actuelle/);
});
