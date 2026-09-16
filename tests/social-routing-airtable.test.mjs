import test from "node:test";
import assert from "node:assert/strict";
import { routeFieldsForProvider } from "../lib/social-routing-airtable.mjs";

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
