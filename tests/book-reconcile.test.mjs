import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../app/api/book-reconcile/route.js", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../.github/workflows/hibou-wake.yml", import.meta.url), "utf8");

test("la réconciliation exige une couverture V2B Completed complète", () => {
  assert.match(route, /statusName\(job\) !== "Completed"/);
  assert.match(route, /jobId\.includes\("-v2b-"\)/);
  assert.match(route, /fullRangeCovered/);
  assert.match(route, /String\(p\.book_record_id/);
});

test("la réconciliation recalcule le QC sans toucher au contenu", () => {
  assert.match(route, /bookQualityGate\(content/);
  assert.match(route, /"Montages couverts": qc\.montageCount/);
  assert.match(route, /"QC éditorial": desiredQc/);
  assert.match(route, /"Prêt export": false/);
  assert.match(route, /"Validation humaine": false/);
  assert.doesNotMatch(route, /"Contenu V1"\s*:/);
});

test("le wake tente la réconciliation sans bloquer les autres files", () => {
  assert.match(workflow, /api\/book-reconcile/);
  assert.match(workflow, /book_reconcile=/);
  assert.match(workflow, /book-reconcile\/\*\*/);
  assert.match(workflow, /\|\| true/);
});
