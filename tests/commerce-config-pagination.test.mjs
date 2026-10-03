import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
for (const path of ["lemon-bootstrap", "lemon-readiness"]) {
  test(`${path} reads every configuration page and retains its authentication`, () => {
    const source = readFileSync(new URL(`../app/api/commerce/${path}/route.js`, import.meta.url), "utf8");
    assert.match(source, /queryAllRecords\(TABLES.configuration/);
    assert.match(source, /verifyGithubActionsToken/);
    assert.doesNotMatch(source, /queryRecords\(TABLES.configuration, \{ pageSize: 100/);
  });
}
