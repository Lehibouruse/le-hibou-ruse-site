import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../app/admin/growth/route.js", import.meta.url), "utf8");

test("le dashboard growth reste privé et non indexable", () => {
  assert.match(source, /adminAuthorized\(request\)/);
  assert.match(source, /X-Robots-Tag/);
  assert.match(source, /noindex,nofollow/);
});

test("le dashboard classe source campagne et contenu", () => {
  assert.match(source, /Réseaux \/ sources/);
  assert.match(source, /Campagnes/);
  assert.match(source, /Vidéos \/ hooks \/ créations/);
  assert.match(source, /growthSummary\(sales\)/);
});
