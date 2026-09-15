import { NextResponse } from "next/server";
import { createRecord, queryRecords, TABLES, updateRecord } from "../../../../lib/airtable";
import { escapeFormula } from "../../../../lib/commerce.mjs";
import { verifyGithubActionsToken } from "../../../../lib/github-oidc.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LEMON_API = "https://api.lemonsqueezy.com/v1";

function flag(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function lemonHeaders(apiKey) {
  return {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/vnd.api+json",
    "Content-Type": "application/vnd.api+json",
  };
}

async function lemonRequest(path, options = {}) {
  const apiKey = String(process.env.LEMON_SQUEEZY_API_KEY || "").trim();
  if (!apiKey) throw new Error("LEMON_SQUEEZY_API_KEY absent");
  const response = await fetch(`${LEMON_API}${path}`, {
    ...options,
    headers: { ...lemonHeaders(apiKey), ...(options.headers || {}) },
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = data?.errors?.[0]?.detail || data?.message || response.statusText;
    const error = new Error(`Lemon API ${response.status}: ${String(detail || "unknown").slice(0, 700)}`);
    error.status = response.status;
    throw error;
  }
  return data;
}

async function activeProduct() {
  const products = await queryRecords(TABLES.products, { filterByFormula: "{Actif}=1", pageSize: 20 });
  return products.find((record) => String(record.fields?.["Lemon Squeezy Variant ID"] || "").trim()) || null;
}

async function configRecord(key) {
  const safe = escapeFormula(key);
  const records = await queryRecords(TABLES.configuration, { filterByFormula: `{Clé}='${safe}'`, pageSize: 1 });
  return records[0] || null;
}

async function ensureWebhook({ storeId, secret, baseUrl, testMode }) {
  const target = `${baseUrl}/api/commerce/lemon-webhook`;
  const list = await lemonRequest(`/webhooks?filter[store_id]=${encodeURIComponent(storeId)}`);
  const existing = (list.data || []).find((hook) => String(hook?.attributes?.url || "") === target);
  if (existing) return { id: String(existing.id), url: target, created: false };
  const created = await lemonRequest("/webhooks", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "webhooks",
        attributes: { url: target, events: ["order_created", "order_refunded"], secret, test_mode: testMode },
        relationships: { store: { data: { type: "stores", id: String(storeId) } } },
      },
    }),
  });
  return { id: String(created.data?.id || ""), url: target, created: true };
}

async function ensureCheckout({ product, storeId, baseUrl, testMode }) {
  const fields = product.fields || {};
  const existing = String(fields["Lemon Squeezy Checkout URL"] || "").trim();
  if (existing) return { url: existing, created: false };
  const variantId = String(fields["Lemon Squeezy Variant ID"] || "").trim();
  const checkout = await lemonRequest("/checkouts", {
    method: "POST",
    body: JSON.stringify({
      data: {
        type: "checkouts",
        attributes: {
          product_options: {
            name: String(fields.Produit || "Le guide du Hibou Rusé"),
            description: String(fields.Description || "").slice(0, 4000),
            redirect_url: `${baseUrl}/merci`,
            receipt_button_text: "Retour au Hibou Rusé",
            receipt_link_url: `${baseUrl}/merci`,
            receipt_thank_you_note: "Votre accès sécurisé au guide est préparé séparément et envoyé à l'adresse utilisée lors de l'achat.",
            enabled_variants: [Number(variantId)],
          },
          checkout_options: { embed: false, media: true, logo: true, desc: true, discount: true },
          checkout_data: { custom: { product_slug: String(fields.Slug || "ebook-le-hibou-ruse"), source: "hibou-site" } },
          preview: true,
          test_mode: testMode,
          expires_at: null,
        },
        relationships: {
          store: { data: { type: "stores", id: String(storeId) } },
          variant: { data: { type: "variants", id: variantId } },
        },
      },
    }),
  });
  const url = String(checkout.data?.attributes?.url || "");
  if (!url.startsWith("https://")) throw new Error("Lemon n'a pas renvoyé d'URL checkout HTTPS");
  await updateRecord(TABLES.products, product.id, { "Lemon Squeezy Checkout URL": url });
  const config = await configRecord("checkout_url");
  if (!config) throw new Error("Configuration checkout_url introuvable");
  await updateRecord(TABLES.configuration, config.id, { Valeur: url, Statut: testMode ? "En attente" : "Actif", Erreur: testMode ? "Checkout Lemon créé en mode test; ne pas ouvrir les ventes." : "" });
  return { url, id: String(checkout.data?.id || ""), created: true, preview: checkout.data?.attributes?.preview || null };
}

export async function POST(request) {
  try {
    const auth = request.headers.get("authorization") || "";
    if (!auth.startsWith("Bearer ")) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    await verifyGithubActionsToken(auth.slice("Bearer ".length));
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error?.message || "Unauthorized").slice(0, 300) }, { status: 401 });
  }

  if (!flag(process.env.LEMON_BOOTSTRAP_ALLOW)) {
    return NextResponse.json({ ok: true, changed: false, ready: false, reason: "LEMON_BOOTSTRAP_ALLOW is not enabled" });
  }
  const storeId = String(process.env.LEMON_SQUEEZY_STORE_ID || "").trim();
  const webhookSecret = String(process.env.LEMON_SQUEEZY_WEBHOOK_SECRET || "").trim();
  const baseUrl = String(process.env.HIBOU_PUBLIC_BASE_URL || "https://le-hibou-ruse-site.vercel.app").replace(/\/$/, "");
  const testMode = flag(process.env.LEMON_SQUEEZY_TEST_MODE);
  if (!storeId || !webhookSecret || !process.env.LEMON_SQUEEZY_API_KEY) {
    return NextResponse.json({ ok: true, changed: false, ready: false, reason: "Lemon credentials/store/webhook secret incomplete" });
  }

  const product = await activeProduct();
  if (!product) {
    return NextResponse.json({ ok: true, changed: false, ready: false, reason: "No active Airtable product with Lemon Variant ID" });
  }

  try {
    const [webhook, checkout] = await Promise.all([
      ensureWebhook({ storeId, secret: webhookSecret, baseUrl, testMode }),
      ensureCheckout({ product, storeId, baseUrl, testMode }),
    ]);
    await createRecord(TABLES.journal, {
      Workflow: "HIBOU_LEMON_BOOTSTRAP_V1",
      Déclencheur: "GitHub OIDC",
      Action: "BOOTSTRAP_LEMON",
      Statut: testMode ? "Test" : "Completed",
      "Dernière exécution": new Date().toISOString(),
      "ID externe": checkout.id || webhook.id,
      "URL résultat": checkout.url,
      Notes: `checkout_created=${checkout.created}; webhook_created=${webhook.created}; test_mode=${testMode}`,
    }).catch(() => {});
    return NextResponse.json({ ok: true, changed: checkout.created || webhook.created, ready: true, test_mode: testMode, checkout: { created: checkout.created, url: checkout.url, preview: checkout.preview }, webhook: { created: webhook.created, id: webhook.id, url: webhook.url } });
  } catch (error) {
    return NextResponse.json({ ok: false, changed: false, ready: false, error: String(error?.message || error).slice(0, 1000) }, { status: 422 });
  }
}
