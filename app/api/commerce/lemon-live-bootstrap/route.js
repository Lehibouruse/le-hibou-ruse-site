import { NextResponse } from "next/server";
import { configMap, createRecord, queryRecords, TABLES, updateRecord } from "../../../../lib/airtable";
import { escapeFormula, resolveLemonWebhookSecret } from "../../../../lib/commerce.mjs";
import { verifyGithubActionsToken } from "../../../../lib/github-oidc.mjs";
import {
  lemonRequest,
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
const ALLOWED_ACTIONS = new Set(["inspect_live", "webhook_live"]);
const REQUIRED_EVENTS = ["order_created", "order_refunded"];

function text(value) { return String(value ?? "").trim(); }

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
  const raw = text(config.public_site_url || "https://le-hibou-ruse-site.vercel.app");
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("public_site_url doit être HTTPS");
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
  if (exact) return { id: lemonResourceId(exact), reused: true };

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
  return { id: text(webhook?.id), reused: false };
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

    if (action === "webhook_live") {
      const webhook = await ensureLiveWebhook(inspected.storeId, publicBaseUrl(state.config));
      result.live_webhook_id = webhook.id;
      result.live_webhook_reused = webhook.reused;
      await Promise.all([
        upsertConfig("lemon_live_webhook_id", webhook.id, "Webhook Lemon live order_created/order_refunded; aucun secret stocké dans Airtable."),
        upsertConfig("lemon_webhook_status", "LIVE_INFRA_READY", "Webhook live opérationnel. Checkout public et livraison automatique restent bloqués tant que les prérequis de lancement ne sont pas validés.", "En attente"),
      ]);
    }

    await journal(action, "Completed", JSON.stringify(result), result.live_webhook_id || inspected.productId);
    return NextResponse.json(result);
  } catch (error) {
    const message = text(error?.message || error || "Erreur Lemon inconnue");
    if (message === "Unauthorized") return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    await journal("live_bootstrap_error", "Error", message).catch(() => {});
    const status = /introuvable|ambigu|inattendu|incompatible/.test(message) ? 409 : /absent|indisponible|doit être|longueur/.test(message) ? 412 : 500;
    return NextResponse.json({ ok: false, error: message.slice(0, 700) }, { status });
  }
}
