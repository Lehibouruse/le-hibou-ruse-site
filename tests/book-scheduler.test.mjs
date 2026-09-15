import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const scheduler = readFileSync(new URL("../app/api/book-scheduler/route.js", import.meta.url), "utf8");
const editorial = readFileSync(new URL("../lib/book-editorial.mjs", import.meta.url), "utf8");
const wake = readFileSync(new URL("../app/api/wake/route.js", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../.github/workflows/hibou-wake.yml", import.meta.url), "utf8");
const airtable = readFileSync(new URL("../lib/airtable.js", import.meta.url), "utf8");

test("le livre est une ressource Airtable connue du runtime", () => {
  assert.match(airtable, /book:\s*"tblIoXioiPj3Rxhft"/);
});

test("CREATE_BOOK est délégué au scheduler dédié avant le worker agentique", () => {
  assert.match(wake, /BOOK_SCHEDULER_PATH = "\/api\/book-scheduler"/);
  assert.match(wake, /action === "CREATE_BOOK"/);
  assert.match(wake, /book_scheduler/);
});

test("le scheduler borne les lots et ne génère jamais tout le corpus en un appel", () => {
  assert.match(scheduler, /MAX_SOURCE_RECORDS = 24/);
  assert.match(scheduler, /end - start \+ 1 > MAX_SOURCE_RECORDS/);
  assert.match(scheduler, /source_start/);
  assert.match(scheduler, /source_end/);
});

test("le contrat éditorial impose une ligne rouge non opérationnelle pour les fraudes", () => {
  assert.match(editorial, /ne doivent jamais devenir des tutoriels/);
  assert.match(editorial, /Ne donne jamais de procédure pour contourner un contrôle/);
  assert.match(editorial, /\[À VÉRIFIER\]/);
});

test("les changements du scheduler déclenchent les self-tests", () => {
  assert.match(workflow, /app\/api\/book-scheduler\/\*\*/);
});
