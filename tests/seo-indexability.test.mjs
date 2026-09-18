import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { publicSiteOrigin, FALLBACK_PUBLIC_ORIGIN } from "../lib/site-origin.mjs";
import robots from "../app/robots.js";
import sitemap from "../app/sitemap.js";

test("le SEO ne canonise jamais d4d5d6.com avant validation explicite du domaine", () => {
  assert.equal(publicSiteOrigin({ HIBOU_PUBLIC_BASE_URL: "https://d4d5d6.com" }), FALLBACK_PUBLIC_ORIGIN);
  assert.equal(publicSiteOrigin({ HIBOU_PUBLIC_BASE_URL: "https://le-hibou-ruse-site.vercel.app" }), FALLBACK_PUBLIC_ORIGIN);
  assert.equal(
    publicSiteOrigin({ HIBOU_CANONICAL_DOMAIN_VERIFIED: "true", HIBOU_CANONICAL_HOST: "d4d5d6.com" }),
    "https://d4d5d6.com",
  );
});

test("robots autorise l'indexation publique et expose le sitemap", () => {
  const value = robots();
  assert.equal(value.rules[0].allow, "/");
  assert.ok(value.rules[0].disallow.includes("/admin/"));
  assert.ok(value.rules[0].disallow.includes("/api/"));
  assert.match(value.sitemap, /\/sitemap\.xml$/);
});

test("le sitemap contient la page d'accueil et les pages publiques principales", () => {
  const urls = sitemap().map((entry) => new URL(entry.url).pathname);
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
  assert.doesNotMatch(layout, /metadataBase: new URL\("https:\/\/d4d5d6\.com"\)/);
});
