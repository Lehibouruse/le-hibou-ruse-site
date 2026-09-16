import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  buildTestCheckoutPayload,
  buildTestWebhookPayload,
  lemonRequest,
} from "../lib/lemon-api.mjs";

const route = readFileSync(new URL("../app/api/commerce/lemon-bootstrap/route.js", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../.github/workflows/lemon-commerce-test.yml", import.meta.url), "utf8");
const webhookRoute = readFileSync(new URL("../app/api/commerce/lemon-webhook/route.js", import.meta.url), "utf8");
const accessRoute = readFileSync(new URL("../app/api/commerce/access/route.js", import.meta.url), "utf8");

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    async text() { return JSON.stringify(body); },
  };
}

test("le checkout Lemon bootstrap est toujours test_mode et borné au variant choisi", () => {
  const payload = buildTestCheckoutPayload({
    storeId: "12",
    variantId: "34",
    productName: "Le guide du Hibou Rusé",
    description: "Test",
    redirectUrl: "https://le-hibou-ruse-site.vercel.app/merci?order=[order_identifier]",
    receiptLinkUrl: "https://le-hibou-ruse-site.vercel.app/merci?order=[order_identifier]",
  });
  assert.equal(payload.data.attributes.test_mode, true);
  assert.deepEqual(payload.data.attributes.product_options.enabled_variants, [34]);
  assert.equal(payload.data.relationships.store.data.id, "12");
  assert.equal(payload.data.relationships.variant.data.id, "34");
  assert.match(payload.data.attributes.product_options.redirect_url, /order=\[order_identifier\]/);
});

test("le webhook Lemon bootstrap exige test_mode et les deux événements de commande", () => {
  const payload = buildTestWebhookPayload({
    storeId: "12",
    url: "https://le-hibou-ruse-site.vercel.app/api/commerce/lemon-webhook",
    secret: "12345678901234567890123456789012",
  });
  assert.equal(payload.data.attributes.test_mode, true);
  assert.deepEqual(payload.data.attributes.events, ["order_created", "order_refunded"]);
  assert.throws(() => buildTestWebhookPayload({ storeId: "12", url: "http://example.com", secret: "123456" }), /HTTPS/);
});

test("le client Lemon envoie les en-têtes JSON:API et le Bearer sans changer d'hôte", async () => {
  let seen;
  const fetchImpl = async (url, options) => {
    seen = { url, options };
    return jsonResponse({ data: [] });
  };
  await lemonRequest("/v1/stores", { apiKey: "secret-test-key", fetchImpl });
  assert.match(seen.url, /^https:\/\/api\.lemonsqueezy\.com\/v1\/stores/);
  assert.equal(seen.options.headers.Authorization, "Bearer secret-test-key");
  assert.equal(seen.options.headers.Accept, "application/vnd.api+json");
  await assert.rejects(
    lemonRequest("https://evil.example/v1/stores", { apiKey: "x", fetchImpl }),
    /Chemin Lemon refusé/,
  );
});

test("la route bootstrap refuse toute action live et n'accepte que le workflow manuel OIDC dédié", () => {
  assert.match(route, /OIDC_WORKFLOW = "lemon-commerce-test\.yml"/);
  assert.match(route, /ALLOWED_ACTIONS = new Set\(\["inspect", "checkout_test", "webhook_test"\]\)/);
  assert.match(route, /allowedEvents: \["workflow_dispatch"\]/);
  assert.doesNotMatch(route, /CRON_SECRET/);
  assert.match(route, /lemon_test_mode_only/);
  assert.match(route, /mode: "test_only"/);
  assert.doesNotMatch(route, /checkout_live|webhook_live|action === "live"/);
});

test("le checkout test est réutilisé au lieu d'être recréé aveuglément", () => {
  assert.match(route, /function existingTestCheckout/);
  assert.match(route, /lemon_test_checkout_id/);
  assert.match(route, /lemon_test_checkout_url/);
  assert.match(route, /test_checkout_reused/);
  assert.match(route, /host !== "lemonsqueezy\.com" && !host\.endsWith\("\.lemonsqueezy\.com"\)/);
});

test("le workflow Lemon est manuel, borné aux actions de test et échoue sur un 404 persistant", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /schedule:/);
  assert.match(workflow, /inspect\|checkout_test\|webhook_test/);
  assert.doesNotMatch(workflow, /checkout_live|webhook_live/);
  assert.match(workflow, /id-token: write/);
  assert.match(workflow, /for attempt in 1 2 3/);
  assert.match(workflow, /Persistent 404 after deployment grace window/);
});

test("le webhook persiste l'order_identifier dans le champ dédié et /merci le privilégie", () => {
  assert.match(webhookRoute, /"Identifiant commande public": order\.identifier/);
  assert.match(accessRoute, /\{Identifiant commande public\}='\$\{safeIdentifier\}'/);
  assert.match(accessRoute, /safeLegacyMarker/);
});
