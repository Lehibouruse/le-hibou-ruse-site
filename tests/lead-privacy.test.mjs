import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const form = readFileSync(new URL("../components/LeadForm.js", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/leads/route.js", import.meta.url), "utf8");

test("le formulaire informe au point de collecte sans présenter le traitement comme un consentement marketing", () => {
  assert.match(form, /politique de confidentialité/);
  assert.match(form, /finalités, durées de conservation et vos droits/);
  assert.doesNotMatch(form, /vous acceptez que ces informations soient utilisées/i);
});

test("le formulaire demande explicitement de ne transmettre aucun secret", () => {
  assert.match(form, /Ne transmettez aucun secret/);
  assert.match(form, /mot de passe/);
  assert.match(form, /carte bancaire/);
  assert.match(form, /identifiant fiscal/);
  assert.match(form, /document d’identité/);
});

test("l'API leads borne la taille, exige JSON, minimise et interdit le cache", () => {
  assert.match(route, /MAX_BODY_BYTES = 10_000/);
  assert.match(route, /application\/json/);
  assert.match(route, /Buffer\.byteLength/);
  assert.match(route, /Requête trop volumineuse/);
  assert.match(route, /Cache-Control.*no-store/s);
  assert.match(route, /\.slice\(0, max\)/);
  assert.doesNotMatch(route, /request\.headers\.get\(["']x-forwarded-for/);
});
