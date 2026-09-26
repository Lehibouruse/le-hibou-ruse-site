import { NextResponse } from "next/server";
import { configMap, createRecord, queryRecords, TABLES } from "../../../../lib/airtable";
import { listLemonFiles, listLemonProducts, listLemonStores, listLemonVariants, lemonResourceId, lemonResourceName, summarizeLemonFiles } from "../../../../lib/lemon-api.mjs";
import { resolveLemonWebhookSecret } from "../../../../lib/commerce.mjs";
import { verifyGithubActionsToken } from "../../../../lib/github-oidc.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const OIDC_WORKFLOW = "lemon-readiness.yml";

function text(value) { return String(value ?? "").trim(); }

async function journalReadiness(summary) {
  const payload = {
    api_key_present: Boolean(summary.api_key_present),
    api_authenticated: Boolean(summary.api_authenticated),
    webhook_secret_ready: Boolean(summary.webhook_secret_ready),
    store_id: text(summary.store_id),
    product_id: text(summary.product_id),
    variant_id: text(summary.variant_id),
    variant_price_cents: summary.variant_price_cents ?? null,
    variant_file_count: Number(summary.variant_file_count || 0),
    variant_published_file_count: Number(summary.variant_published_file_count || 0),
    native_file_delivery_ready: Boolean(summary.native_file_delivery_ready),
    variant_files: Array.isArray(summary.variant_files) ? summary.variant_files : [],
    blockers: Array.isArray(summary.blockers) ? summary.blockers : [],
  };
  await createRecord(TABLES.journal, {
    Workflow: "HIBOU_LEMON_READINESS_V2",
    Déclencheur: "GitHub Actions / read-only audit",
    Action: "inspect_live_delivery",
    Statut: payload.api_authenticated ? "Completed" : "Error",
    "Dernière exécution": new Date().toISOString(),
    "ID externe": payload.variant_id || payload.product_id || payload.store_id || "",
    Erreur: payload.api_authenticated ? "" : payload.blockers.join(","),
    Notes: JSON.stringify(payload),
  }).catch(() => {});
}

async function authenticate(request) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) throw new Error("Unauthorized");
  await verifyGithubActionsToken(auth.slice("Bearer ".length), {
    allowedWorkflowFiles: [OIDC_WORKFLOW],
    allowedEvents: ["push", "workflow_dispatch"],
  });
}

export async function POST(request) {
  try {
    await authenticate(request);
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const keyPresent = Boolean(text(process.env.LEMON_SQUEEZY_API_KEY));
  const webhookSecretPresent = Boolean(text(process.env.LEMON_SQUEEZY_WEBHOOK_SECRET));
  const webhookSecretReady = Boolean(text(resolveLemonWebhookSecret(process.env)));
  if (!keyPresent) {
    const result = {
      ok: true,
      mode: "readiness_only",
      api_key_present: false,
      api_authenticated: false,
      webhook_secret_present: webhookSecretPresent,
      webhook_secret_ready: webhookSecretReady,
      blockers: ["missing_LEMON_SQUEEZY_API_KEY"],
    };
    await journalReadiness(result);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  }

  const [configuration, products] = await Promise.all([
    queryRecords(TABLES.configuration, { pageSize: 100, priorityAware: false }),
    queryRecords(TABLES.products, { filterByFormula: "{Actif}=1", pageSize: 20, priorityAware: false }),
  ]);
  const config = configMap(configuration);
  const productRecord = products.find((record) => /guide du hibou rusé/i.test(text(record?.fields?.Produit))) || products[0] || null;

  try {
    const stores = await listLemonStores();
    const configuredStoreId = text(config.lemon_store_id);
    const store = stores.find((item) => lemonResourceId(item) === configuredStoreId) || stores[0] || null;
    const storeId = lemonResourceId(store);

    let productId = "";
    let productName = "";
    let variantId = "";
    let variantPriceCents = null;
    let productStatus = "";
    let productTestMode = null;
    let buyNowUrl = "";
    let variantFiles = [];

    if (storeId) {
      const lemonProducts = await listLemonProducts(storeId);
      const configuredProductId = text(productRecord?.fields?.["Lemon Squeezy Product ID"] || config.lemon_product_id);
      const lemonProduct = lemonProducts.find((item) => lemonResourceId(item) === configuredProductId)
        || lemonProducts.find((item) => /hibou/i.test(lemonResourceName(item)))
        || lemonProducts[0]
        || null;
      productId = lemonResourceId(lemonProduct);
      productName = lemonResourceName(lemonProduct);
      productStatus = text(lemonProduct?.attributes?.status);
      productTestMode = lemonProduct?.attributes?.test_mode === true;
      const candidateBuyNow = text(lemonProduct?.attributes?.buy_now_url);
      try {
        const url = new URL(candidateBuyNow);
        if (url.protocol === "https:" && (url.hostname === "lemonsqueezy.com" || url.hostname.endsWith(".lemonsqueezy.com"))) {
          buyNowUrl = url.toString();
        }
      } catch {}

      if (productId) {
        const variants = await listLemonVariants(productId);
        const configuredVariantId = text(productRecord?.fields?.["Lemon Squeezy Variant ID"] || config.lemon_variant_id);
        const variant = variants.find((item) => lemonResourceId(item) === configuredVariantId)
          || variants.find((item) => Number(item?.attributes?.price) === 2900)
          || variants[0]
          || null;
        variantId = lemonResourceId(variant);
        variantPriceCents = Number.isFinite(Number(variant?.attributes?.price)) ? Number(variant?.attributes?.price) : null;
        if (variantId) variantFiles = summarizeLemonFiles(await listLemonFiles(variantId));
      }
    }

    const result = {
      ok: true,
      mode: "readiness_only",
      api_key_present: true,
      api_authenticated: true,
      webhook_secret_present: webhookSecretPresent,
      webhook_secret_ready: webhookSecretReady,
      store_count: stores.length,
      store_id: storeId,
      product_id: productId,
      product_name: productName,
      variant_id: variantId,
      variant_price_cents: variantPriceCents,
      product_status: productStatus,
      product_test_mode: productTestMode,
      buy_now_url: buyNowUrl,
      expected_store_id: configuredStoreId,
      expected_product_id: text(productRecord?.fields?.["Lemon Squeezy Product ID"] || config.lemon_product_id),
      expected_variant_id: text(productRecord?.fields?.["Lemon Squeezy Variant ID"] || config.lemon_variant_id),
      variant_file_count: variantFiles.length,
      variant_published_file_count: variantFiles.filter((file) => file.status === "published" && file.test_mode === false).length,
      variant_files: variantFiles,
      native_file_delivery_ready: variantFiles.some((file) => file.status === "published" && file.test_mode === false),
      blockers: [],
    };
    await journalReadiness(result);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const result = {
      ok: true,
      mode: "readiness_only",
      api_key_present: true,
      api_authenticated: false,
      webhook_secret_present: webhookSecretPresent,
      webhook_secret_ready: webhookSecretReady,
      error: String(error?.message || error).slice(0, 500),
      blockers: ["lemon_api_auth_failed"],
    };
    await journalReadiness(result);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  }
}
