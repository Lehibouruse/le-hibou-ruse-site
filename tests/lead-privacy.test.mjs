import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const form = readFileSync(new URL("../components/LeadForm.js", import.meta.url), "utf8");
const route = readFileSync(new URL("../app/api/leads/route.js", import.meta.url), "utf8");
const homepage = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");

test("le formulaire public reste léger et ne fabrique pas de consentement marketing", () => {
  assert.doesNotMatch(form, /vous acceptez que ces informations soient utilisées/i);
  assert.doesNotMatch(form, /Ne transmettez aucun secret/);
  assert.doesNotMatch(form, /numéro complet de carte bancaire/);
});

test("la politique de confidentialité reste accessible depuis le site public", () => {
  assert.match(homepage, /href="\/confidentialite"/);
  assert.match(homepage, />Confidentialité</);
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
