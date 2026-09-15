import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../app/admin/growth/route.js", import.meta.url), "utf8");

test("le dashboard Growth utilise le helper paginé réellement exporté", () => {
  assert.match(source, /import \{ queryAllRecords, TABLES \} from \"\.\.\/\.\.\/\.\.\/lib\/airtable\"/);
  assert.doesNotMatch(source, /getAllRecords/);
  assert.match(source, /queryAllRecords\(TABLES\.sales/);
  assert.match(source, /queryAllRecords\(TABLES\.conversionEvents/);
  assert.match(source, /queryAllRecords\(TABLES\.socialPerformance/);
});
