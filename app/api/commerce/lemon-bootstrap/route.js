import { NextResponse } from "next/server";
import { configMap, createRecord, queryRecords, TABLES, updateRecord } from "../../../../lib/airtable";
import { escapeFormula } from "../../../../lib/commerce.mjs";
import { verifyGithubActionsToken } from "../../../../lib/github-oidc.mjs";
import {
  createTestLemonCheckout,
  createTestLemonWebhook,
  lemonResourceId,
  lemonResourceName,
  listLemonProducts,
  listLemonStores,
  listLemonVariants,
  listLemonWebhooks,
} from "../../../../lib/lemon-api.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const OIDC_WORKFLOW = "lemon-commerce-test.yml";
const ALLOWED_ACTIONS = new Set(["inspect", "checkout_test", "webhook_test"]);

function text(value) { return String(value ?? "").trim(); }
function truthy(value) { return ["1", "true", "yes", "oui", "on"].includes(text(value).toLowerCase()); }

async function authenticate(request) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) throw new Error("Unauthorized");
  const token = auth.slice("Bearer ".length);
  try {
    await verifyGithubActionsToken(token, {
      allowedWorkflowFiles: [OIDC_WORKFLOW],
      allowedEvents: ["workflow_dispatch"],
    });
  } catch {
    throw new Error("Unauthorized");
  }
}

async function upsertConfig(key, value, description, status = "Actif") {
  const safe = escapeFormula(key);
  const records = await queryRecords(TABLES.configuration, {
    filterByFormula: `{Clé}='${safe}'`,
    pageSize: 2,
    priorityAware: false,
  });
  const fields = {
    Clé: key,
    Valeur: String(value ?? ""),
    Type: "Texte",
    Actif: true,
    Description: description,
    Statut: status,
  };
  if (records[0]) return updateRecord(TABLES.configuration, records[0].id, fields);
  return createRecord(TABLES.configuration, fields);
}

async function loadState() {
  const [configuration, products] = await Promise.all([
    queryRecords(TABLES.configuration, { pageSize: 100, priorityAware: false }),
    queryRecords(TABLES.products, { filterByFormula: "{Actif}=1", pageSize: 20, priorityAware: false }),
  ]);
  return {
    configuration,
    config: configMap(configuration),
    productRecord: products[0] || null,
  };
}

function chooseStore(stores, configuredId) {
  const id = text(configuredId);
  if (id) {
    const match = stores.find((store) => lemonResourceId(store) === id);
    if (!match) throw new Error(`Store Lemon configuré introuvable: ${id}`);
    return match;
  }
  if (stores.length !== 1) throw new Error(`Sélection store ambiguë: ${stores.length} stores; renseigner lemon_store_id`);
  return stores[0];
}

function chooseProduct(products, expectedName, configuredId) {
  const configured = text(configuredId);
  if (configured) {
    const byId = products.find((product) => lemonResourceId(product) === configured);
    if (byId) return byId;
  }
  const matches = products.filter((product) => lemonResourceName(product) === expectedName);
  if (matches.length !== 1) throw new Error(`Produit Lemon « ${expectedName} »: ${matches.length} correspondance(s)`);
  return matches[0];
}

function chooseVariant(variants, configuredId) {
  const configured = text(configuredId);
  if (configured) {
    const byId = variants.find((variant) => lemonResourceId(variant) === configured);
    if (byId) return byId;
  }
  const priced = variants.filter((variant) => {
    const attrs = variant?.attributes || {};
    return Number(attrs.price) === 2900 && attrs.is_subscription !== true;
  });
  if (priced.length === 1) return priced[0];
  if (variants.length === 1) return variants[0];
  throw new Error(`Variant Lemon ambigu: ${variants.length} variants, ${priced.length} à 29 €`);
}

function testBaseUrl(config) {
  const raw = text(config.lemon_test_base_url || config.public_site_url || "https://le-hibou-ruse-site.vercel.app");
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("lemon_test_base_url doit être HTTPS");
  return url.origin;
}

function existingTestCheckout(config) {
  const id = text(config.lemon_test_checkout_id);
  const raw = text(config.lemon_test_checkout_url);
  if (!id || !raw) return null;
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || (host !== "lemonsqueezy.com" && !host.endsWith(".lemonsqueezy.com"))) return null;
    return { id, url: url.toString(), reused: true };
  } catch {
    return null;
  }
}

async function inspectLemon(state) {
  if (!process.env.LEMON_SQUEEZY_API_KEY) throw new Error("LEMON_SQUEEZY_API_KEY absent du serveur");
  if (!truthy(state.config.lemon_test_mode_only)) throw new Error("lemon_test_mode_only doit rester TRUE pendant le bootstrap");
  if (!state.productRecord) throw new Error("Produit Airtable actif introuvable");

  const expectedName = text(state.config.lemon_product_name || state.productRecord.fields?.Produit || "Le guide du Hibou Rusé");
  const stores = await listLemonStores();
  const store = chooseStore(stores, state.config.lemon_store_id);
  const storeId = lemonResourceId(store);

  const products = await listLemonProducts(storeId);
  const product = chooseProduct(products, expectedName, state.productRecord.fields?.["Lemon Squeezy Product ID"] || state.config.lemon_product_id);
  const productId = lemonResourceId(product);

  const variants = await listLemonVariants(productId);
  const variant = chooseVariant(variants, state.productRecord.fields?.["Lemon Squeezy Variant ID"] || state.config.lemon_variant_id);
  const variantId = lemonResourceId(variant);
  const variantPrice = Number(variant?.attributes?.price || 0);

  if (variant?.attributes?.is_subscription === true) throw new Error("Le variant Hibou ne doit pas être un abonnement");
  if (variantPrice !== 2900) throw new Error(`Prix variant inattendu: ${variantPrice} centimes`);

  await updateRecord(TABLES.products, state.productRecord.id, {
    "Lemon Squeezy Product ID": productId,
    "Lemon Squeezy Variant ID": variantId,
  });
  await Promise.all([
    upsertConfig("lemon_store_id", storeId, "Store ID Lemon détecté via API."),
    upsertConfig("lemon_product_id", productId, "Product ID Lemon détecté via API."),
    upsertConfig("lemon_variant_id", variantId, "Variant ID Lemon 29 € détecté via API."),
    upsertConfig("lemon_api_status", "CONNECTED_TEST_ONLY", "API Lemon authentifiée; opérations mutantes limitées au test mode."),
    upsertConfig("lemon_product_status", "API_DISCOVERED", "Produit réel trouvé via API; fichier partiel temporaire autorisé uniquement pour tests."),
  ]);

  return { store, storeId, product, productId, variant, variantId, variantPrice };
}

async function ensureTestWebhook(storeId, baseUrl) {
  const endpoint = `${baseUrl}/api/commerce/lemon-webhook`;
  const requiredEvents = ["order_created", "order_refunded"];
  const existing = await listLemonWebhooks(storeId);
  const sameEndpoint = existing.filter((item) => text(item?.attributes?.url) === endpoint);
  const exact = sameEndpoint.find((item) => item?.attributes?.test_mode === true
    && requiredEvents.every((event) => (item?.attributes?.events || []).includes(event)));
  if (exact) return { id: lemonResourceId(exact), reused: true };
  if (sameEndpoint.length) throw new Error("Webhook Lemon existant sur cet endpoint mais configuration incompatible; revue manuelle requise");

  const secret = text(process.env.LEMON_SQUEEZY_WEBHOOK_SECRET);
  if (!secret) throw new Error("LEMON_SQUEEZY_WEBHOOK_SECRET absent du serveur");
  const created = await createTestLemonWebhook({
    storeId,
    url: endpoint,
    events: requiredEvents,
    secret,
  });
  return { id: created.id, reused: false };
}

async function journal(action, status, notes, externalId = "") {
  await createRecord(TABLES.journal, {
    Workflow: "HIBOU_LEMON_BOOTSTRAP_V1",
    Déclencheur: "GitHub Actions / Work",
    Action: action,
    Statut: status,
    "Dernière exécution": new Date().toISOString(),
    "ID externe": externalId,
    Notes: text(notes).slice(0, 10000),
  }).catch(() => {});
}

export async function POST(request) {
  try {
    await authenticate(request);
    const payload = await request.json().catch(() => ({}));
    const action = text(payload?.action || "inspect");
    if (!ALLOWED_ACTIONS.has(action)) {
      return NextResponse.json({ ok: false, error: "Action refusée; test-only endpoint" }, { status: 400 });
    }

    const state = await loadState();
    const inspected = await inspectLemon(state);
    const baseUrl = testBaseUrl(state.config);
    const result = {
      ok: true,
      mode: "test_only",
      action,
      store_id: inspected.storeId,
      product_id: inspected.productId,
      variant_id: inspected.variantId,
      variant_price_cents: inspected.variantPrice,
    };

    if (action === "checkout_test") {
      const existing = existingTestCheckout(state.config);
      const checkout = existing || await createTestLemonCheckout({
        storeId: inspected.storeId,
        variantId: inspected.variantId,
        productName: text(state.config.lemon_product_name || "Le guide du Hibou Rusé"),
        description: text(state.config.lemon_product_description),
        redirectUrl: `${baseUrl}/merci?order=[order_identifier]`,
        receiptButtonText: text(state.config.lemon_receipt_button_text || "Lire mon guide"),
        receiptLinkUrl: `${baseUrl}/merci?order=[order_identifier]`,
        receiptThankYouNote: text(state.config.lemon_receipt_thank_you_note),
      });
      result.test_checkout_id = checkout.id;
      result.test_checkout_url = checkout.url;
      result.test_checkout_reused = Boolean(checkout.reused);
      await Promise.all([
        upsertConfig("lemon_test_checkout_id", checkout.id, "Identifiant du checkout Lemon de test. Ne pas utiliser pour le lancement live."),
        upsertConfig("lemon_test_checkout_url", checkout.url, "Checkout Lemon test_mode=true. Ne jamais publier sur le site."),
        upsertConfig("lemon_checkout_status", "TEST_READY", "Checkout de test disponible; checkout live toujours non configuré.", "En attente"),
      ]);
    }

    if (action === "webhook_test") {
      const webhook = await ensureTestWebhook(inspected.storeId, baseUrl);
      result.test_webhook_id = webhook.id;
      result.test_webhook_reused = webhook.reused;
      await Promise.all([
        upsertConfig("lemon_test_webhook_id", webhook.id, "Webhook Lemon test_mode=true; aucun secret stocké ici."),
        upsertConfig("lemon_webhook_status", "TEST_READY", "Webhook test order_created/order_refunded opérationnel; webhook live non configuré.", "En attente"),
      ]);
    }

    await journal(action, "Completed", JSON.stringify({ ...result, test_checkout_url: result.test_checkout_url || "" }), result.test_webhook_id || result.test_checkout_id || inspected.productId);
    return NextResponse.json(result);
  } catch (error) {
    const message = text(error?.message || error || "Erreur Lemon inconnue");
    if (message === "Unauthorized") return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    await journal("bootstrap_error", "Error", message).catch(() => {});
    const status = /introuvable|ambigu|inattendu|incompatible/.test(message) ? 409 : /absent|doit rester|doit être/.test(message) ? 412 : 500;
    return NextResponse.json({ ok: false, error: message.slice(0, 700) }, { status });
  }
}
