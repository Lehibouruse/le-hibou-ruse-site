import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../app/api/conversion-event/route.js", import.meta.url), "utf8");

test("la collecte conversion n'accepte que les origines Hibou exactes", () => {
  assert.match(route, /https:\/\/d4d5d6\.com/);
  assert.match(route, /https:\/\/www\.d4d5d6\.com/);
  assert.match(route, /https:\/\/le-hibou-ruse-site\.vercel\.app/);
  assert.doesNotMatch(route, /endsWith\(.*vercel\.app/);
});

test("la collecte conversion reste minimale, bornée et non mise en cache", () => {
  assert.match(route, /MAX_BODY_BYTES = 10_000/);
  assert.match(route, /application\/json/);
  assert.match(route, /Buffer\.byteLength/);
  assert.match(route, /Cache-Control.*no-store/s);
  assert.doesNotMatch(route, /x-forwarded-for|x-real-ip|cf-connecting-ip/i);
  assert.doesNotMatch(route, /user-agent/i);
});

test("la route n'écrit que les données d'attribution explicitement allowlistées", () => {
  for (const field of ["Event ID", "Session ID", "Occurred At", "UTM Source", "UTM Medium", "Campaign", "UTM Content", "Landing Page", "Referrer"]) {
    assert.match(route, new RegExp(field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(route, /Email:|Contact:|IP:|User Agent:/);
});
