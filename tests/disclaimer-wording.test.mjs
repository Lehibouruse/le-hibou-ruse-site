import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const disclaimer = readFileSync(new URL("../docs/disclaimer-canonical.txt", import.meta.url), "utf8");

test("le disclaimer canonique conserve l’humour", () => {
  assert.match(disclaimer, /explore avec humour l’optimisation légale et ses zones d’interprétation/i);
  assert.match(disclaimer, /jamais la fraude, la fausse déclaration ou la dissimulation/i);
});
