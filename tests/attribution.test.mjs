import assert from "node:assert/strict";
import test from "node:test";
import {
  captureAttribution,
  attributionProvenance,
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

test("reconnaît une arrivée Google sans UTM sans inventer de campagne", () => {
  const attribution = captureAttribution({
    href: "https://d4d5d6.com/guide",
    referrer: "https://www.google.fr/search?q=patrimoine",
  });
  assert.equal(attribution.referrer, "https://www.google.fr");
  assert.equal(attribution.utm_source, undefined);
  assert.equal(attributionProvenance(attribution), "Google organique");
});

test("un checkout Lemon non signé reçoit uniquement des custom data bornées", () => {
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

test("un checkout Lemon signé reste strictement inchangé", () => {
  const raw = "https://hibou.lemonsqueezy.com/checkout/buy/abc?expires=1790000000&signature=deadbeef&embed=1";
  const href = checkoutWithAttribution(
    raw,
    { utm_source: "instagram", utm_campaign: "launch", utm_content: "reel-001" },
    "checkout_opened",
  );
  assert.equal(href, raw);
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

test("la page d'arrivée et le referrer ne conservent aucun secret de requête", () => {
  const captured = captureAttribution({
    href: "https://d4d5d6.com/merci?order=private-order-id&utm_source=google",
    search: "?order=private-order-id&utm_source=google",
    referrer: "https://example.com/access?token=private-token",
  });
  assert.equal(captured.landing_page, "/merci");
  assert.equal(captured.utm_source, "google");
  assert.equal(captured.referrer, "https://example.com");
  const untrusted = normalizeAttribution({ landing_page: "/merci?order=private-order-id", referrer: "https://example.com/access?token=private-token" });
  assert.equal(untrusted.landing_page, "/merci");
  assert.equal(untrusted.referrer, "https://example.com");
  assert.doesNotMatch(JSON.stringify({ captured, untrusted }), /private-order-id|private-token/);
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
    landing_page: "/",
    referrer: "https://instagram.com",
  });
});
