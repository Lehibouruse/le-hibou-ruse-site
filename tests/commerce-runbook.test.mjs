import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const launch = readFileSync(new URL("../docs/COMMERCE_LAUNCH_RUNBOOK.md", import.meta.url), "utf8");
const work = readFileSync(new URL("../docs/WORK_LEMON_TEST_RUNBOOK.md", import.meta.url), "utf8");

test("les tests sandbox gardent le lancement commercial fermé", () => {
  assert.match(work, /commerce_launch_authorized` reste `false` pendant toute cette session sandbox\/test mode/);
  assert.match(work, /Aucun checkout live n'est créé ni publié/);
  assert.match(work, /test_mode=true/);
});

test("le test live E2E utilise une fenêtre autorisée sans publier le checkout", () => {
  for (const text of [launch, work]) {
    assert.match(text, /commerce_launch_authorized=true/);
    assert.match(text, /ne pas renseigner `Configuration\.checkout_url`/);
    assert.match(text, /remettre immédiatement `commerce_launch_authorized=false`/i);
  }
});

test("l'ouverture publique reste une étape distincte après le test live", () => {
  assert.match(launch, /Ouverture publique ultérieure/);
  assert.match(work, /Ouverture publique, plus tard/);
  assert.match(launch, /renseigner `Configuration\.checkout_url` avec le checkout LIVE validé/);
});
