import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const mentions = readFileSync(new URL("../app/mentions-legales/page.js", import.meta.url), "utf8");
const privacy = readFileSync(new URL("../app/confidentialite/page.js", import.meta.url), "utf8");
const cgv = readFileSync(new URL("../app/cgv/page.js", import.meta.url), "utf8");
const home = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");

test("les mentions légales restent pré-lancement et n'inventent aucune identité vendeur", () => {
  assert.match(mentions, /Version de pré-lancement/);
  assert.match(mentions, /DÉNOMINATION(?: SOCIALE)? \/ NOM À (?:CONFIRMER|COMPLÉTER)/);
  assert.match(mentions, /SIREN/);
  assert.match(mentions, /RCS \/ RNE/);
  assert.match(mentions, /Téléphone[^\n]*\[(?:numéro|à)/i);
  assert.match(mentions, /Directeur de la publication[^\n]*\[/i);
  assert.match(mentions, /hébergé par <strong>Vercel Inc\./);
  assert.match(mentions, /téléphonique officielle de l’hébergeur à compléter/i);
  assert.match(mentions, /Lemon Squeezy/);
  assert.match(mentions, /médiateur[^\n]*(?:adhéré|adhésion)/i);
});

test("la politique de confidentialité documente prestataires, bases, durées, droits et attribution sans stockage persistant", () => {
  for (const item of ["Vercel", "Airtable", "Lemon Squeezy", "Digify", "CNIL"]) assert.match(privacy, new RegExp(item));
  assert.match(privacy, /Version de pré-lancement/);
  assert.match(privacy, /DÉNOMINATION(?: SOCIALE)? \/ NOM À CONFIRMER/);
  assert.match(privacy, /Finalités et bases juridiques/);
  assert.match(privacy, /3 ans/);
  assert.match(privacy, /13 mois/);
  assert.match(privacy, /12 mois/);
  assert.match(privacy, /10 ans/);
  assert.match(privacy, /aucun cookie, localStorage ou sessionStorage/i);
  assert.match(privacy, /uniquement en mémoire de la page/i);
  assert.match(privacy, /stockage persistant[^\n]*consentement préalable conforme/i);
  assert.match(privacy, /mécanismes de purge et d’archivage[^\n]*alignés/i);
});

test("les CGV restent non applicables et conservent les protections du contenu numérique", () => {
  assert.match(cgv, /Version de pré-lancement — non encore applicable/);
  assert.match(cgv, /DÉNOMINATION(?: SOCIALE)? \/ NOM À CONFIRMER/);
  assert.match(cgv, /29 €/);
  assert.match(cgv, /Merchant of Record/);
  assert.match(cgv, /L\.221-28, 13°/);
  assert.match(cgv, /consentement exprès/i);
  assert.match(cgv, /reconnaissance expresse de la perte du droit de rétractation/i);
  assert.match(cgv, /support durable/i);
  assert.match(cgv, /L\.224-25-12/);
  assert.match(cgv, /garantie légale de conformité/i);
  assert.match(cgv, /NOM DU MÉDIATEUR[^\n]*APRÈS ADHÉSION EFFECTIVE/);
  assert.match(cgv, /n’entreront en vigueur qu’après publication de leur version finale/i);
});

test("la landing expose un lien CGV", () => {
  assert.match(home, /href="\/cgv"/);
});
