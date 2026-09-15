import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const mentions = readFileSync(new URL("../app/mentions-legales/page.js", import.meta.url), "utf8");
const privacy = readFileSync(new URL("../app/confidentialite/page.js", import.meta.url), "utf8");
const cgv = readFileSync(new URL("../app/cgv/page.js", import.meta.url), "utf8");
const home = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");

test("les mentions légales gardent les champs vendeur explicitement non inventés", () => {
  assert.match(mentions, /DÉNOMINATION \/ NOM À COMPLÉTER/);
  assert.match(mentions, /SIREN \/ RNE/);
  assert.match(mentions, /Lemon Squeezy/);
});

test("la politique de confidentialité décrit les principaux prestataires et les droits", () => {
  for (const item of ["Vercel", "Airtable", "Lemon Squeezy", "Digify", "CNIL"]) assert.match(privacy, new RegExp(item));
  assert.match(privacy, /À COMPLÉTER AVANT LANCEMENT/);
});

test("les CGV restent explicitement non applicables avant finalisation", () => {
  assert.match(cgv, /Projet de CGV — non encore applicable/);
  assert.match(cgv, /29 €/);
  assert.match(cgv, /Merchant of Record/);
  assert.match(cgv, /droit de rétractation/i);
  assert.match(cgv, /médiateur/i);
});

test("la landing expose un lien CGV", () => {
  assert.match(home, /href="\/cgv"/);
});
