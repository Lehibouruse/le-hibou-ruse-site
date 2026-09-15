import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../app/api/site-identity/route.js", import.meta.url), "utf8");
const layout = readFileSync(new URL("../app/layout.js", import.meta.url), "utf8");

test("le site expose une identité publique non sensible pour diagnostiquer le domaine", () => {
  assert.match(route, /Le Hibou Rusé/);
  assert.match(route, /d4d5d6\.com/);
  assert.match(route, /received_host/);
  assert.match(route, /X-Hibou-Site/);
  assert.match(route, /no-store/);
});

test("le domaine acheté est la canonique SEO même avant redirection stricte", () => {
  assert.match(layout, /metadataBase: new URL\("https:\/\/d4d5d6\.com"\)/);
  assert.match(layout, /alternates: \{ canonical: "\/" \}/);
  assert.match(layout, /robots: \{ index: true, follow: true \}/);
});
