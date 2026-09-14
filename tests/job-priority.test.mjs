import assert from "node:assert/strict";
import test from "node:test";
import { buildQueryParams, TABLES } from "../lib/airtable.js";
import { firstPriorityJob, orderJobsByPriority } from "../lib/job-priority.mjs";

const job = (id, priority, created_at) => ({ id, fields: { priority, created_at } });

test("Critical passe avant High, Normal et Low", () => {
  const ordered = orderJobsByPriority([
    job("low", "Low", "2026-01-01T00:00:00Z"),
    job("normal", "Normal", "2026-01-01T00:00:00Z"),
    job("high", "High", "2026-01-03T00:00:00Z"),
    job("critical", "Critical", "2026-01-04T00:00:00Z"),
  ]);
  assert.deepEqual(ordered.map((item) => item.id), ["critical", "high", "normal", "low"]);
});

test("à priorité égale, le plus ancien passe d'abord", () => {
  const selected = firstPriorityJob([
    job("new", { name: "High" }, "2026-01-02T00:00:00Z"),
    job("old", { name: "High" }, "2026-01-01T00:00:00Z"),
  ]);
  assert.equal(selected.id, "old");
});

test("les lectures chronologiques de Jobs deviennent priorité puis ancienneté", () => {
  const params = buildQueryParams(TABLES.jobs, { sortField: "created_at", pageSize: 10 });
  assert.equal(params.get("sort[0][field]"), "priority");
  assert.equal(params.get("sort[0][direction]"), "asc");
  assert.equal(params.get("sort[1][field]"), "created_at");
  assert.equal(params.get("sort[1][direction]"), "asc");
});

test("une lecture Jobs explicitement descendante reste chronologique", () => {
  const params = buildQueryParams(TABLES.jobs, { sortField: "created_at", sortDirection: "desc" });
  assert.equal(params.get("sort[0][field]"), "created_at");
  assert.equal(params.get("sort[0][direction]"), "desc");
  assert.equal(params.get("sort[1][field]"), null);
});
