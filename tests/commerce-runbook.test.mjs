import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const launch = readFileSync(new URL("../docs/COMMERCE_LAUNCH_RUNBOOK.md", import.meta.url), "utf8");
const work = readFileSync(new URL("../docs/WORK_LEMON_TEST_RUNBOOK.md", import.meta.url), "utf8");

test("le runbook TEST documente l'état LIVE sans permettre au test de le modifier", () => {
  assert.match(work, /Le parcours \*\*LIVE\*\* et le parcours \*\*TEST\*\* sont deux systèmes distincts/);
  assert.match(work, /commerce_launch_authorized=true/);
  assert.match(work, /aucun test demandé dans ce document ne doit créer un achat réel/i);
  assert.match(work, /ne doit donc pas recréer le Store\/Product\/Variant LIVE ni modifier le checkout public/);
});

test("le parcours TEST est fail-closed sur une clé et des ressources TEST dédiées", () => {
  assert.match(work, /LEMON_SQUEEZY_TEST_API_KEY/);
  assert.match(work, /La clé LIVE .* n'est jamais un fallback du parcours TEST/);
  assert.match(work, /test_mode=true/);
  assert.match(work, /inspect.*checkout_test.*webhook_test/s);
});

test("une commande TEST ne constitue jamais une preuve de livraison Digify réelle", () => {
  assert.match(work, /ne doit jamais provoquer un ajout ou retrait de destinataire Digify réel/);
  assert.match(work, /n'appelle pas Digify/);
  assert.match(work, /Le test Digify ne dépend pas d'une fausse commande Lemon/);
});

test("le runbook de lancement conserve les garde-fous du LIVE", () => {
  assert.match(launch, /commerce_launch_authorized=true/);
  assert.match(launch, /Ouverture publique ultérieure/);
});
