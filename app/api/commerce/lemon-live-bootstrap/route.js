import { NextResponse } from "next/server";
import { configMap, createRecord, queryRecords, TABLES, updateRecord } from "../../../../lib/airtable";
import { escapeFormula, resolveLemonWebhookSecret } from "../../../../lib/commerce.mjs";
import { verifyGithubActionsToken } from "../../../../lib/github-oidc.mjs";
import {
  lemonRequest,
  createLiveLemonCheckout,
  retrieveLemonCheckout,
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

const OIDC_WORKFLOW = "lemon-live-bootstrap.yml";
const ALLOWED_ACTIONS = new Set(["inspect_live", "webhook_live", "checkout_live"]);
const REQUIRED_EVENTS = ["order_created", "order_refunded"];
const VERCEL_FALLBACK = "https://le-hibou-ruse-site.vercel.app";

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

function publicBaseUrl(config) {
  const raw = truthy(config.domain_verified) && text(config.public_site_url)
    ? text(config.public_site_url)
    : VERCEL_FALLBACK;
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("URL webhook Lemon doit être HTTPS");
  return url.origin;
}

async function inspectLive(state) {
  if (!process.env.LEMON_SQUEEZY_API_KEY) throw new Error("LEMON_SQUEEZY_API_KEY absent du serveur");
  if (!state.productRecord) throw new Error("Produit Airtable actif introuvable");

  const expectedName = text(state.config.lemon_product_name || state.productRecord.fields?.Produit || "Guide du Hibou Rusé");
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

  if (product?.attributes?.test_mode !== false || variant?.attributes?.test_mode !== false) throw new Error("Produit ou variant Lemon en mode test");
  if (variant?.attributes?.is_subscription === true) throw new Error("Le variant Hibou ne doit pas être un abonnement");
  if (variantPrice !== 2900) throw new Error(`Prix variant inattendu: ${variantPrice} centimes`);

  await updateRecord(TABLES.products, state.productRecord.id, {
    "Lemon Squeezy Product ID": productId,
    "Lemon Squeezy Variant ID": variantId,
  });
  await Promise.all([
    upsertConfig("lemon_store_id", storeId, "Store ID Lemon live détecté via API."),
    upsertConfig("lemon_product_id", productId, "Product ID Lemon live détecté via API."),
    upsertConfig("lemon_variant_id", variantId, "Variant ID Lemon live 29 € détecté via API."),
    upsertConfig("lemon_api_status", "CONNECTED_LIVE_INFRA", "API Lemon live authentifiée. Aucun checkout public n'est créé par ce bootstrap."),
    upsertConfig("lemon_product_status", "LIVE_API_DISCOVERED", "Produit live trouvé via API; lancement commercial toujours bloqué par les garde-fous Hibou."),
  ]);

  return { storeId, productId, variantId, variantPrice };
}

async function ensureLiveWebhook(storeId, baseUrl) {
  const endpoint = `${baseUrl}/api/commerce/lemon-webhook`;
  const existing = await listLemonWebhooks(storeId);
  const sameEndpoint = existing.filter((item) => text(item?.attributes?.url) === endpoint);
  const exact = sameEndpoint.find((item) => item?.attributes?.test_mode !== true
    && REQUIRED_EVENTS.every((event) => (item?.attributes?.events || []).includes(event)));
  if (exact) return { id: lemonResourceId(exact), reused: true, endpoint };

  const incompatibleLive = sameEndpoint.find((item) => item?.attributes?.test_mode !== true);
  if (incompatibleLive) {
    throw new Error("Webhook Lemon live déjà présent sur cet endpoint avec des événements incompatibles; revue manuelle requise");
  }

  const secret = text(process.env.LEMON_SQUEEZY_WEBHOOK_SECRET || resolveLemonWebhookSecret(process.env));
  if (!secret) throw new Error("Secret webhook Lemon indisponible");
  if (secret.length < 6 || secret.length > 40) throw new Error("Secret webhook Lemon: longueur 6-40 requise");

  const body = {
    data: {
      type: "webhooks",
      attributes: {
        url: endpoint,
        events: REQUIRED_EVENTS,
        secret,
      },
      relationships: {
        store: { data: { type: "stores", id: String(storeId) } },
      },
    },
  };
  const created = await lemonRequest("/v1/webhooks", { method: "POST", body });
  const webhook = created?.data || {};
  if (webhook?.attributes?.test_mode === true) throw new Error("Webhook Lemon live refusé: test_mode=true");
  return { id: text(webhook?.id), reused: false, endpoint };
}

const PARTIAL_CHECKOUT_DESCRIPTION = "Version partielle actuelle du Guide du Hibou Rusé. Vous recevez immédiatement le PDF V1 disponible aujourd’hui. Le guide est encore en cours d’enrichissement.";
const ORDER_PAGE_URL = "https://d4d5d6.com/merci?order=[order_identifier]";

function safeCheckoutUrl(value) {
  try {
    const url = new URL(text(value));
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && (host === "lemonsqueezy.com" || host.endsWith(".lemonsqueezy.com")) ? url.toString() : "";
  } catch {
    return "";
  }
}

async function ensureLiveCheckout(state, inspected) {
  const existingId = text(state.config.lemon_live_checkout_id);
  if (existingId) {
    const checkout = await retrieveLemonCheckout(existingId);
    const attrs = checkout?.attributes || {};
    const options = attrs.product_options || {};
    const url = safeCheckoutUrl(attrs.url);
    if (attrs.test_mode === false
      && String(attrs.store_id ?? "") === inspected.storeId
      && String(attrs.variant_id ?? "") === inspected.variantId
      && /partielle?/i.test(text(options.description))
      && text(options.redirect_url) === ORDER_PAGE_URL
      && text(options.receipt_link_url) === ORDER_PAGE_URL
      && url) {
      return { id: existingId, url, reused: true };
    }
    throw new Error("Checkout live enregistré incompatible; revue manuelle requise");
  }

  return createLiveLemonCheckout({
    storeId: inspected.storeId,
    variantId: inspected.variantId,
    productName: "Guide du Hibou Rusé — version partielle actuelle",
    description: PARTIAL_CHECKOUT_DESCRIPTION,
    redirectUrl: ORDER_PAGE_URL,
    receiptButtonText: "Lire mon guide",
    receiptLinkUrl: ORDER_PAGE_URL,
    receiptThankYouNote: "Merci pour votre achat. Votre accès personnel au PDF partiel actuel est créé automatiquement après confirmation du paiement.",
  });
}

async function journal(action, status, notes, externalId = "") {
  await createRecord(TABLES.journal, {
    Workflow: "HIBOU_LEMON_LIVE_INFRA_V1",
    Déclencheur: "GitHub Actions / ChatGPT",
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
    const action = text(payload?.action || "inspect_live");
    if (!ALLOWED_ACTIONS.has(action)) {
      return NextResponse.json({ ok: false, error: "Action live refusée" }, { status: 400 });
    }

    const state = await loadState();
    const inspected = await inspectLive(state);
    const result = {
      ok: true,
      mode: "live_infra_only",
      action,
      store_id: inspected.storeId,
      product_id: inspected.productId,
      variant_id: inspected.variantId,
      variant_price_cents: inspected.variantPrice,
      public_checkout_enabled: false,
    };

    if (action === "checkout_live") {
      if (!truthy(state.config.commerce_launch_authorized)) throw new Error("Lancement commercial non autorisé");
      if (!text(state.config.lemon_live_webhook_id)) throw new Error("Webhook Lemon live absent");
      if (!text(state.productRecord.fields?.["Digify File GUID"])) throw new Error("PDF Digify absent");
      const checkout = await ensureLiveCheckout(state, inspected);
      result.live_checkout_id = checkout.id;
      result.live_checkout_url = checkout.url;
      result.live_checkout_reused = Boolean(checkout.reused);
      await upsertConfig("lemon_live_checkout_id", checkout.id, "Checkout Lemon LIVE avec description explicite du PDF partiel, redirection et reçu vers /merci.");
      await updateRecord(TABLES.products, state.productRecord.id, { "Lemon Squeezy Checkout URL": checkout.url });
      await upsertConfig("checkout_url", checkout.url, "Checkout Lemon LIVE avec version partielle actuelle clairement annoncée.");
      await upsertConfig("lemon_checkout_status", "LIVE_PUBLIC", "Checkout live personnalisé à 29 € publié sur le site; PDF partiel explicitement annoncé.");
      result.public_checkout_enabled = true;
    }

    if (action === "webhook_live") {
      const webhook = await ensureLiveWebhook(inspected.storeId, publicBaseUrl(state.config));
      result.live_webhook_id = webhook.id;
      result.live_webhook_reused = webhook.reused;
      result.live_webhook_endpoint = webhook.endpoint;
      await Promise.all([
        upsertConfig("lemon_live_webhook_id", webhook.id, "Webhook Lemon live order_created/order_refunded; aucun secret stocké dans Airtable."),
        upsertConfig("lemon_live_webhook_endpoint", webhook.endpoint, "Endpoint public réellement utilisé par Lemon pour les événements live."),
        upsertConfig("lemon_webhook_status", "LIVE_INFRA_READY", "Webhook live opérationnel. Checkout public et livraison automatique restent bloqués tant que les prérequis de lancement ne sont pas validés.", "En attente"),
      ]);
    }

    await journal(action, "Completed", JSON.stringify(result), result.live_webhook_id || result.live_checkout_id || inspected.productId);
    return NextResponse.json(result);
  } catch (error) {
    const message = text(error?.message || error || "Erreur Lemon inconnue");
    if (message === "Unauthorized") return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    await journal("live_bootstrap_error", "Error", message).catch(() => {});
    const status = /introuvable|ambigu|inattendu|incompatible/.test(message) ? 409 : /absent|indisponible|doit être|longueur/.test(message) ? 412 : 500;
    return NextResponse.json({ ok: false, error: message.slice(0, 700) }, { status });
  }
}
