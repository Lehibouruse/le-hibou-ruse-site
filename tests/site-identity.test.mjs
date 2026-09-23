import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../app/api/site-identity/route.js", import.meta.url), "utf8");
const layout = readFileSync(new URL("../app/layout.js", import.meta.url), "utf8");
const home = readFileSync(new URL("../app/page.js", import.meta.url), "utf8");

test("le site expose une identité publique non sensible pour diagnostiquer le domaine", () => {
  assert.match(route, /Le Hibou Rusé/);
  assert.match(route, /d4d5d6\.com/);
  assert.match(route, /received_host/);
  assert.match(route, /X-Hibou-Site/);
  assert.match(route, /no-store/);
});

test("un domaine acheté mais non vérifié ne devient pas canonique SEO prématurément", () => {
  assert.match(layout, /metadataBase: new URL\(publicOrigin\)/);
  assert.doesNotMatch(layout, /alternates: \{ canonical: "\/" \}/);
  assert.match(home, /alternates: \{ canonical: "\/" \}/);
  assert.match(layout, /index: true/);
  assert.match(layout, /follow: true/);
  assert.doesNotMatch(layout, /metadataBase: new URL\("https:\/\/d4d5d6\.com"\)/);
});
