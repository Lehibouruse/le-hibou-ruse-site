import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  buildTestCheckoutPayload,
  buildLiveCheckoutPayload,
  buildTestWebhookPayload,
  lemonRequest,
  listLemonFiles,
  retrieveLemonCheckout,
  summarizeLemonFiles,
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

test("le checkout Lemon bootstrap est toujours test_mode, français et borné au variant choisi", () => {
  const payload = buildTestCheckoutPayload({
    storeId: "12",
    variantId: "34",
    productName: "Le guide du Hibou Rusé",
    description: "Test",
    redirectUrl: "https://le-hibou-ruse-site.vercel.app/merci?order=[order_identifier]",
    receiptLinkUrl: "https://le-hibou-ruse-site.vercel.app/merci?order=[order_identifier]",
    checkoutCustomData: {
      consent_id: "consent-123",
      consent_at: "2026-09-22T20:30:00.000Z",
      consent_version: "DIGITAL_SUPPLY_V1",
      immediate_supply_consent: "true",
      withdrawal_loss_ack: "true",
    },
  });
  assert.equal(payload.data.attributes.test_mode, true);
  assert.equal(payload.data.attributes.checkout_data.custom.consent_id, "consent-123");
  assert.equal(payload.data.attributes.checkout_data.custom.immediate_supply_consent, "true");
  assert.equal(payload.data.attributes.checkout_data.custom.withdrawal_loss_ack, "true");
  assert.deepEqual(payload.data.attributes.product_options.enabled_variants, [34]);
  assert.equal(payload.data.attributes.checkout_options.locale, "fr");
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

test("un checkout stocké est relu chez Lemon avant réutilisation", async () => {
  let seenUrl = "";
  const id = "5e8b546c-c561-4a2c-a586-40c18bb2a195";
  const fetchImpl = async (url) => {
    seenUrl = url;
    return jsonResponse({ data: { id, attributes: { test_mode: true } } });
  };
  const checkout = await retrieveLemonCheckout(id, { apiKey: "secret-test-key", fetchImpl });
  assert.equal(checkout.id, id);
  assert.equal(checkout.attributes.test_mode, true);
  assert.match(seenUrl, new RegExp(`/v1/checkouts/${id}$`));
  await assert.rejects(
    retrieveLemonCheckout("not-a-checkout", { apiKey: "x", fetchImpl }),
    /Checkout ID Lemon invalide/,
  );
});

test("la route bootstrap refuse toute action live et n'accepte que le workflow manuel OIDC dédié", () => {
  assert.match(route, /OIDC_WORKFLOW = "lemon-commerce-test\.yml"/);
  assert.match(route, /ALLOWED_ACTIONS = new Set\(\["preflight", "inspect", "checkout_test", "webhook_test"\]\)/);
  assert.match(route, /allowedEvents: \["workflow_dispatch"\]/);
  assert.doesNotMatch(route, /authorization[^\n]{0,200}CRON_SECRET|Bearer[^\n]{0,200}CRON_SECRET/i);
  assert.match(route, /lemon_test_mode_only/);
  assert.match(route, /LEMON_SQUEEZY_TEST_API_KEY/);
  assert.doesNotMatch(route, /const testApiKey\s*=\s*text\(process\.env\.LEMON_SQUEEZY_API_KEY\)/);
  assert.doesNotMatch(route, /apiKey:\s*process\.env\.LEMON_SQUEEZY_API_KEY/);
  assert.match(route, /const testApiKey = text\(process\.env\.LEMON_SQUEEZY_TEST_API_KEY\)/);
  assert.match(route, /lemon_test_store_id/);
  assert.match(route, /lemon_test_product_id/);
  assert.match(route, /lemon_test_variant_id/);
  assert.match(route, /product\?\.attributes\?\.test_mode !== true/);
  assert.match(route, /variant\?\.attributes\?\.test_mode !== true/);
  assert.match(route, /mode: "test_only"/);
  assert.doesNotMatch(route, /checkout_live|webhook_live|action === "live"/);
  assert.match(route, /action === "preflight"/);
  assert.match(route, /missing_LEMON_SQUEEZY_TEST_API_KEY/);
  assert.match(route, /test_live_id_collision/);
  assert.match(route, /ready_for_inspect/);
  assert.match(route, /live_api_key_present/);
});

test("le checkout test est vérifié chez Lemon avant d'être réutilisé", () => {
  assert.match(route, /async function existingTestCheckout/);
  assert.match(route, /retrieveLemonCheckout\(id, \{ apiKey \}\)/);
  assert.match(route, /attrs\.test_mode !== true/);
  assert.match(route, /Store ID différent/);
  assert.match(route, /Variant ID différent/);
  assert.match(route, /test_checkout_reused/);
  assert.match(route, /Number\(error\?\.status\) === 404/);
});

test("le workflow Lemon est manuel, borné aux actions de test et échoue sur un 404 persistant", () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /default: "preflight"/);
  assert.doesNotMatch(workflow, /schedule:/);
  assert.match(workflow, /preflight\|inspect\|checkout_test\|webhook_test/);
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


test("le checkout live exige une description transparente de l’édition numérique et refuse test_mode", () => {
  const input = {
    storeId: "475333",
    variantId: "2140119",
    productName: "Guide du Hibou Rusé",
    description: "Le Guide du Hibou Rusé — édition numérique. Accès immédiat au guide disponible à cette date. Le contenu pourra faire l’objet de mises à jour ultérieures.",
    redirectUrl: "https://d4d5d6.com/merci?order=[order_identifier]",
    receiptLinkUrl: "https://d4d5d6.com/merci?order=[order_identifier]",
  };
  const payload = buildLiveCheckoutPayload(input);
  assert.equal(payload.data.attributes.test_mode, false);
  assert.equal(payload.data.attributes.checkout_options.desc, true);
  assert.deepEqual(payload.data.attributes.product_options.enabled_variants, [2140119]);
  assert.match(payload.data.attributes.product_options.description, /édition numérique/i);
  assert.throws(() => buildLiveCheckoutPayload({ ...input, description: "Guide complet" }), /description transparente/);
});


test("le readiness Lemon liste les fichiers du variant sans exposer leurs URL signées", async () => {
  let seenUrl = "";
  const fetchImpl = async (url) => {
    seenUrl = url;
    return jsonResponse({ data: [{
      id: "88",
      attributes: {
        variant_id: 2140119,
        name: "guide.pdf",
        extension: "pdf",
        download_url: "https://app.lemonsqueezy.com/download/secret?signature=do-not-expose",
        size: 123456,
        size_formatted: "120 KB",
        version: "1.0",
        status: "published",
        test_mode: false,
      },
    }] });
  };
  const files = await listLemonFiles("2140119", { apiKey: "secret-live-key", fetchImpl });
  assert.match(seenUrl, /\/v1\/files\?/);
  assert.match(seenUrl, /filter%5Bvariant_id%5D=2140119/);
  const summary = summarizeLemonFiles(files);
  assert.deepEqual(summary, [{
    id: "88",
    name: "guide.pdf",
    extension: "pdf",
    size: 123456,
    size_formatted: "120 KB",
    version: "1.0",
    status: "published",
    test_mode: false,
  }]);
  assert.equal(JSON.stringify(summary).includes("download_url"), false);
  assert.equal(JSON.stringify(summary).includes("signature"), false);
});

test("la route readiness expose la disponibilité de livraison native sans mutation", () => {
  const source = readFileSync(new URL("../app/api/commerce/lemon-readiness/route.js", import.meta.url), "utf8");
  assert.match(source, /listLemonFiles\(variantId\)/);
  assert.match(source, /native_file_delivery_ready/);
  assert.match(source, /variant_published_file_count/);
  assert.doesNotMatch(source, /create.*File|upload.*File|delete.*File/i);
});
