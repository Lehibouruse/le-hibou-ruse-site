import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalHost,
  canonicalRedirectEnabled,
  canonicalRedirectUrl,
  shouldCanonicalRedirect,
} from "../lib/canonical-domain.mjs";

const enabled = { HIBOU_CANONICAL_REDIRECT_ENABLED: "true", HIBOU_CANONICAL_HOST: "d4d5d6.com" };

test("la redirection canonique est désactivée par défaut", () => {
  assert.equal(canonicalRedirectEnabled({}), false);
  assert.equal(shouldCanonicalRedirect({ host: "le-hibou-ruse-site.vercel.app", accept: "text/html", env: {} }), false);
});

test("www et alias Vercel redirigent après activation", () => {
  assert.equal(shouldCanonicalRedirect({ host: "www.d4d5d6.com", accept: "text/html", env: enabled }), true);
  assert.equal(shouldCanonicalRedirect({ host: "le-hibou-ruse-site.vercel.app", accept: "text/html", env: enabled }), true);
});

test("le domaine canonique ne boucle jamais", () => {
  assert.equal(canonicalHost(enabled), "d4d5d6.com");
  assert.equal(shouldCanonicalRedirect({ host: "d4d5d6.com", accept: "text/html", env: enabled }), false);
});

test("les appels API et POST ne sont pas redirigés", () => {
  assert.equal(shouldCanonicalRedirect({ host: "le-hibou-ruse-site.vercel.app", method: "POST", accept: "application/json", env: enabled }), false);
  assert.equal(shouldCanonicalRedirect({ host: "le-hibou-ruse-site.vercel.app", method: "GET", accept: "application/json", env: enabled }), false);
});

test("la destination conserve chemin et query", () => {
  const url = canonicalRedirectUrl("https://www.d4d5d6.com/articles/test?utm_source=x", enabled);
  assert.equal(url.toString(), "https://d4d5d6.com/articles/test?utm_source=x");
});
