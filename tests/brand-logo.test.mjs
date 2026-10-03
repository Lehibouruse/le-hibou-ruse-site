import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const page = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");
const store = readFileSync(new URL("../components/BookStore.js", import.meta.url), "utf8");
const brand = readFileSync(new URL("../components/Brand.js", import.meta.url), "utf8");

test("le logo du Hibou utilise l'asset monocle local et stable", () => {
  assert.match(page, /<BookStore\b/);
  assert.match(store, /<Brand\b[^>]*logoUrl="\/hibou-monocle\.webp"/);
  assert.doesNotMatch(store, /logo\["Image URL"\]/);
  assert.doesNotMatch(store, /product\["Image URL"\]/);
  assert.match(brand, /logoUrl = "\/hibou-monocle\.webp"/);
});

test("le site ne dépend plus du CDN Instagram pour son logo de marque", () => {
  for (const source of [page, store, brand]) assert.doesNotMatch(source, /cdninstagram\.com/i);
});
