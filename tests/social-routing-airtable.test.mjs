import test from "node:test";
import assert from "node:assert/strict";
import { routeFieldsForProvider, routeTransition } from "../lib/social-routing-airtable.mjs";

test("projette les trois routes opérationnelles dans les champs Airtable", () => {
  const plans = {
    read: { routes: [{ provider: "youtube", route: "direct_api" }] },
    publish: { routes: [{ provider: "youtube", route: "chatgpt_metricool" }] },
    analytics: { routes: [{ provider: "youtube", route: "blocked" }] },
  };
  assert.deepEqual(routeFieldsForProvider("youtube", plans), {
    "Route lecture": "direct_api",
    "Route publication": "chatgpt_metricool",
    "Route analytics": "blocked",
  });
});

test("une route absente reste bloquée par défaut", () => {
  assert.deepEqual(routeFieldsForProvider("snapchat", {}), {
    "Route lecture": "blocked",
    "Route publication": "blocked",
    "Route analytics": "blocked",
  });
});

test("détecte uniquement les transitions réelles pour éviter les écritures périodiques inutiles", () => {
  assert.deepEqual(routeTransition({
    "Route lecture": "chatgpt_metricool",
    "Route publication": "chatgpt_metricool",
    "Route analytics": "blocked",
  }, {
    "Route lecture": "direct_api",
    "Route publication": "chatgpt_metricool",
    "Route analytics": "blocked",
  }), {
    "Route lecture": { from: "chatgpt_metricool", to: "direct_api" },
  });
});

test("un état identique est idempotent", () => {
  const current = {
    "Route lecture": "blocked",
    "Route publication": "blocked",
    "Route analytics": "blocked",
  };
  assert.deepEqual(routeTransition(current, current), {});
});
