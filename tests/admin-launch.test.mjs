import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../app/admin/launch/route.js", import.meta.url), "utf8");

test("le dashboard de lancement reste privé et utilise la readiness réelle", () => {
  assert.match(source, /adminAuthorized/);
  assert.match(source, /commercialReadiness/);
  assert.match(source, /TABLES\.configuration/);
  assert.match(source, /TABLES\.products/);
  assert.match(source, /TABLES\.book/);
  assert.match(source, /TABLES\.legal/);
  assert.match(source, /Blocages restants/);
  assert.match(source, /\/admin\/social/);
  assert.match(source, /\/admin\/growth/);
});
