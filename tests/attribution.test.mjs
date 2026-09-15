import assert from "node:assert/strict";
import test from "node:test";
import {
  captureAttribution,
  checkoutWithAttribution,
  normalizeAttribution,
  saleAttribution,
  socialCampaignUrl,
} from "../lib/attribution.mjs";

test("capture une campagne et conserve la landing initiale", () => {
  const captured = captureAttribution({
    search: "?utm_source=tiktok&utm_medium=organic_social&utm_campaign=launch&utm_content=video_042",
    href: "https://d4d5d6.com/?utm_source=tiktok&utm_content=video_042",
    referrer: "https://www.tiktok.com/@lehibouruse",
  });
  assert.equal(captured.utm_source, "tiktok");
  assert.equal(captured.utm_content, "video_042");
  assert.match(captured.landing_page, /^\//);
  assert.match(captured.referrer, /^https:\/\/www\.tiktok\.com/);
});

test("un checkout Lemon reçoit uniquement des custom data bornées", () => {
  const href = checkoutWithAttribution(
    "https://hibou.lemonsqueezy.com/checkout/buy/abc?embed=1",
    { utm_source: "youtube", utm_campaign: "video-test", utm_content: "hook-a" },
    "checkout_opened",
  );
  const url = new URL(href);
  assert.equal(url.searchParams.get("checkout[custom][utm_source]"), "youtube");
  assert.equal(url.searchParams.get("checkout[custom][utm_campaign]"), "video-test");
  assert.equal(url.searchParams.get("checkout[custom][utm_content]"), "hook-a");
  assert.equal(url.searchParams.get("checkout[custom][click_event]"), "checkout_opened");
  assert.equal(url.searchParams.get("embed"), "1");
});

test("aucune donnée n'est ajoutée à un lien non Lemon", () => {
  const raw = "https://d4d5d6.com/merci";
  assert.equal(checkoutWithAttribution(raw, { utm_source: "x" }), raw);
});

test("normalisation supprime contrôles et borne les valeurs", () => {
  const normalized = normalizeAttribution({ utm_source: "  tik\u0000tok  ", utm_content: "a".repeat(500) });
  assert.equal(normalized.utm_source, "tiktok");
  assert.equal(normalized.utm_content.length, 160);
});

test("génère un lien social traçable par provider et création", () => {
  const url = new URL(socialCampaignUrl({
    provider: "instagram",
    campaign: "serie-failles",
    contentId: "reel-018-hook-b",
  }));
  assert.equal(url.origin, "https://d4d5d6.com");
  assert.equal(url.searchParams.get("utm_source"), "instagram");
  assert.equal(url.searchParams.get("utm_medium"), "organic_social");
  assert.equal(url.searchParams.get("utm_campaign"), "serie-failles");
  assert.equal(url.searchParams.get("utm_content"), "reel-018-hook-b");
});

test("les custom data Lemon deviennent une attribution vente", () => {
  const result = saleAttribution({
    source: "instagram",
    medium: "organic_social",
    campaign: "serie_d5",
    content: "reel_018",
    landing_page: "/?utm_source=instagram",
    referrer: "https://instagram.com/lehibouruse",
  });
  assert.deepEqual(result, {
    utm_source: "instagram",
    utm_medium: "organic_social",
    utm_campaign: "serie_d5",
    utm_content: "reel_018",
    landing_page: "/?utm_source=instagram",
    referrer: "https://instagram.com/lehibouruse",
  });
});
