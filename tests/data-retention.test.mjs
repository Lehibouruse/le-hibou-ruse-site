import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  RETENTION_POLICY,
  classifyAutomationLog,
  classifyConversionEvent,
  classifyProspect,
  classifySale,
  retentionAudit,
} from "../lib/data-retention.mjs";

const route = readFileSync(new URL("../app/api/admin/retention-audit/route.js", import.meta.url), "utf8");
const now = Date.parse("2026-09-16T12:00:00Z");

function record(field, value, createdTime = "") {
  return { fields: { [field]: value }, createdTime };
}

test("les durées de rétention suivent de vraies périodes calendaires", () => {
  assert.deepEqual(RETENTION_POLICY.conversion_events, { months: 13 });
  assert.deepEqual(RETENTION_POLICY.automation_logs, { months: 12 });
  assert.deepEqual(RETENTION_POLICY.prospects, { years: 3 });
  assert.equal(RETENTION_POLICY.sales.protected_archive, true);

  assert.equal(classifyConversionEvent(record("Occurred At", "2025-08-15T12:00:00Z"), now).status, "candidate_for_purge");
  assert.equal(classifyConversionEvent(record("Occurred At", "2025-08-17T12:00:00Z"), now).status, "keep");
  assert.equal(classifyAutomationLog(record("Dernière exécution", "2025-09-15T12:00:00Z"), now).status, "candidate_for_purge");
  assert.equal(classifyProspect(record("Date", "2023-09-15T12:00:00Z"), now).status, "candidate_for_purge");
});

test("les ventes restent une archive protégée et ne deviennent jamais candidates à la purge automatique", () => {
  const oldSale = classifySale(record("Date", "2010-01-01T00:00:00Z"), now);
  assert.equal(oldSale.status, "legal_archive");
});

test("une date métier absente peut utiliser createdTime sans inventer de date", () => {
  const result = classifyProspect(record("Date", "", "2026-09-12T10:00:00Z"), now);
  assert.equal(result.status, "keep");
  assert.ok(result.at > 0);
});

test("l'audit ne renvoie que des agrégats de conservation", () => {
  const audit = retentionAudit({
    now,
    conversionEvents: [record("Occurred At", "2025-01-01T00:00:00Z")],
    automationLogs: [record("Dernière exécution", "2026-09-15T00:00:00Z")],
    prospects: [record("Date", "2022-01-01T00:00:00Z")],
    sales: [record("Date", "2020-01-01T00:00:00Z")],
  });
  assert.equal(audit.mode, "read_only");
  assert.equal(audit.destructive_actions, false);
  assert.equal(audit.conversion_events.counts.candidate_for_purge, 1);
  assert.equal(audit.automation_logs.counts.keep, 1);
  assert.equal(audit.prospects.counts.candidate_for_purge, 1);
  assert.equal(audit.sales.counts.legal_archive, 1);
  assert.doesNotMatch(JSON.stringify(audit), /email|contact|notes/i);
});

test("la route de retention est privée, no-store et strictement non destructive", () => {
  assert.match(route, /adminAuthorized\(request\)/);
  assert.match(route, /adminUnauthorized\(\)/);
  assert.match(route, /export async function GET/);
  assert.match(route, /Cache-Control.*no-store/s);
  assert.match(route, /X-Robots-Tag.*noindex/s);
  assert.doesNotMatch(route, /export async function (DELETE|POST|PATCH|PUT)/);
  assert.doesNotMatch(route, /deleteRecord|updateRecord|createRecord/);
});
