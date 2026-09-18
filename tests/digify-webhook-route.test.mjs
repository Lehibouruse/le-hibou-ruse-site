import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../app/api/commerce/digify-webhook/route.js", import.meta.url), "utf8");

test("le webhook Digify déduplique les redéliveries déjà traitées avant d'incrémenter Airtable", () => {
  const dedupeAt = route.indexOf("const duplicate = await priorJournal(action)");
  const updateAt = route.indexOf("await updateRecord(TABLES.sales, sale.id, fields)");
  assert.ok(dedupeAt >= 0);
  assert.ok(updateAt > dedupeAt);
  assert.match(route, /duplicate: true/);
  assert.match(route, /HIBOU_DIGIFY_WEBHOOK_V2/);
});

test("un événement unmatched reste rejouable après création ultérieure de la vente", () => {
  assert.match(route, /OR\(\{Statut\}='Completed',\{Statut\}='Policy Alert'\)/);
  assert.doesNotMatch(route, /\{Statut\}='Unmatched'/);
});

test("Print et Download déclenchent une alerte de politique sans casser le webhook", () => {
  assert.match(route, /event\.type === "Print" \|\| event\.type === "Download"/);
  assert.match(route, /Policy Alert/);
  assert.match(route, /policy_alert: policyViolation/);
});

test("un EventTime Digify invalide est rejeté au lieu d'être remplacé silencieusement", () => {
  assert.match(route, /Invalid Digify EventTime/);
  assert.match(route, /invalid_event_time/);
});
