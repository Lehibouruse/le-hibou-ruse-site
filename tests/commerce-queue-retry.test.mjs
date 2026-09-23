import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source=readFileSync(new URL("../.github/workflows/commerce-queue.yml",import.meta.url),"utf8");

test("commerce queue retries only bounded transient failures",()=>{
  assert.match(source,/for attempt in 1 2 3/);
  assert.match(source,/429\|500\|502\|503\|504/);
  assert.match(source,/persistent transient failure/);
  assert.match(source,/non-retriable HTTP failure/);
  assert.doesNotMatch(source,/continue[\s\S]*case "\$http_code" in[\s\S]*400\|401\|403/);
});

test("commerce queue still refuses manual review and never hides a persistent failure",()=>{
  assert.match(source,/assert d\.get\("status"\) != "manual_review"/);
  assert.match(source,/return 1/);
  assert.match(source,/call_commerce_endpoint revoke/);
  assert.match(source,/call_commerce_endpoint delivery/);
});
