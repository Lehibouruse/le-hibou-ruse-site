import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { analyticsResultIsValidated } from "../lib/social-account-validation.mjs";

const route = readFileSync(new URL("../app/api/social-metrics/route.js", import.meta.url), "utf8");

test("un fetch métrique sans statut d'analytics explicite compte comme validation réelle", () => {
  assert.equal(analyticsResultIsValidated({ views: 42 }), true);
});

test("les statuts analytics incomplets ne valident jamais Analytics OK", () => {
  for (const status of ["scope_missing", "unavailable", "error", "needs_reauth"]) {
    assert.equal(analyticsResultIsValidated({ analytics_status: status }), false);
  }
});

test("un statut analytics actif peut valider la capacité", () => {
  assert.equal(analyticsResultIsValidated({ analytics_status: "active" }), true);
});

test("la collecte métrique synchronise l'état Analytics OK seulement après fetch réussi", () => {
  assert.match(route, /const metrics = await fetchSocialMetrics/);
  assert.match(route, /markSocialAnalyticsValidated\(target\.provider, metrics\)/);
  const fetchPosition = route.indexOf("const metrics = await fetchSocialMetrics");
  const validationPosition = route.indexOf("markSocialAnalyticsValidated(target.provider, metrics)");
  assert.ok(fetchPosition >= 0 && validationPosition > fetchPosition);
});
