import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { publicSiteOrigin, VERCEL_PUBLIC_ORIGIN } from "../lib/site-origin.mjs";
import robots from "../app/robots.js";
import sitemap from "../app/sitemap.js";

test("d4d5d6.com est la référence SEO canonique", () => {
  assert.equal(publicSiteOrigin(), VERCEL_PUBLIC_ORIGIN);
  assert.equal(publicSiteOrigin(), "https://d4d5d6.com");
  assert.equal(VERCEL_PUBLIC_ORIGIN, "https://d4d5d6.com");
});

test("robots autorise l'indexation publique et expose le sitemap canonique", () => {
  const value = robots();
  assert.equal(value.rules[0].allow, "/");
  assert.ok(value.rules[0].disallow.includes("/admin/"));
  assert.ok(value.rules[0].disallow.includes("/api/"));
  assert.equal(value.host, "https://d4d5d6.com");
  assert.equal(value.sitemap, "https://d4d5d6.com/sitemap.xml");
});

test("le sitemap contient les pages publiques principales sur d4d5d6.com", () => {
  const entries = sitemap();
  assert.ok(entries.every((entry) => entry.url.startsWith("https://d4d5d6.com")));
  assert.ok(entries.every((entry) => !entry.url.includes("vercel.app")));
  const urls = entries.map((entry) => new URL(entry.url).pathname);
  assert.ok(urls.includes("/"));
  assert.ok(urls.includes("/mentions-legales"));
  assert.ok(urls.includes("/cgv"));
  assert.ok(urls.includes("/confidentialite"));
});

test("les métadonnées de marque restent indexables et contiennent un WebSite JSON-LD", () => {
  const layout = readFileSync(new URL("../app/layout.js", import.meta.url), "utf8");
  assert.match(layout, /Le Hibou Rusé/);
  assert.match(layout, /googleBot/);
  assert.match(layout, /"@type": "WebSite"/);
  assert.match(layout, /metadataBase: new URL\(publicOrigin\)/);
});
