import assert from "node:assert/strict";
import test from "node:test";
import { buildQueryParams, TABLES } from "../lib/airtable.js";

test("borne pageSize Airtable à 100", () => {
  const params = buildQueryParams(TABLES.sales, { pageSize: 1000 }, 100);
  assert.equal(params.get("pageSize"), "100");
});

test("conserve le tri prioritaire des Jobs", () => {
  const params = buildQueryParams(TABLES.jobs, { sortField: "created_at", sortDirection: "asc", pageSize: 100 });
  assert.equal(params.get("sort[0][field]"), "priority");
  assert.equal(params.get("sort[1][field]"), "created_at");
});
