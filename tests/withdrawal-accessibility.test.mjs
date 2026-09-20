import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const home = fs.readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
const withdrawal = fs.readFileSync(new URL("../app/retractation/page.js", import.meta.url), "utf8");

test("la fonctionnalité de rétractation est directement accessible depuis le footer public", () => {
  assert.match(home, /href="\/retractation"/);
  assert.match(home, /Rétractation — informations légales/);
});

test("la page de rétractation rappelle le caractère durable de l'accusé avant lancement", () => {
  assert.match(withdrawal, /support durable/i);
  assert.match(withdrawal, /confirmation correspondante.*support durable/i);
});
