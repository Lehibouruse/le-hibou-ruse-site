import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { publicSiteOrigin, VERCEL_PUBLIC_ORIGIN } from "../lib/site-origin.mjs";
import robots from "../app/robots.js";
import sitemap from "../app/sitemap.js";

test("Vercel reste la référence SEO jusqu'à changement explicite du code", () => {
  assert.equal(publicSiteOrigin(), VERCEL_PUBLIC_ORIGIN);
  assert.equal(publicSiteOrigin({ HIBOU_CANONICAL_DOMAIN_VERIFIED: "true", HIBOU_CANONICAL_HOST: "d4d5d6.com" }), VERCEL_PUBLIC_ORIGIN);
  assert.equal(VERCEL_PUBLIC_ORIGIN, "https://le-hibou-ruse-site.vercel.app");
});

test("robots autorise l'indexation publique et expose le sitemap", () => {
  const value = robots();
  assert.equal(value.rules[0].allow, "/");
  assert.ok(value.rules[0].disallow.includes("/admin/"));
  assert.ok(value.rules[0].disallow.includes("/api/"));
  assert.equal(value.host, VERCEL_PUBLIC_ORIGIN);
  assert.equal(value.sitemap, `${VERCEL_PUBLIC_ORIGIN}/sitemap.xml`);
});

test("le sitemap contient la page d'accueil et les pages publiques principales sur Vercel", () => {
  const entries = sitemap();
  assert.ok(entries.every((entry) => entry.url.startsWith(VERCEL_PUBLIC_ORIGIN)));
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
  assert.doesNotMatch(layout, /metadataBase: new URL\("https:\/\/d4d5d6\.com"\)/);
});
