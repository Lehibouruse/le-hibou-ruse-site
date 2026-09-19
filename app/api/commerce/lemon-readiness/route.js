import { NextResponse } from "next/server";
import { configMap, queryRecords, TABLES } from "../../../../lib/airtable";
import { listLemonProducts, listLemonStores, listLemonVariants, lemonResourceId, lemonResourceName } from "../../../../lib/lemon-api.mjs";
import { verifyGithubActionsToken } from "../../../../lib/github-oidc.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const OIDC_WORKFLOW = "lemon-readiness.yml";

function text(value) { return String(value ?? "").trim(); }

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
  if (!keyPresent) {
    return NextResponse.json({
      ok: true,
      mode: "readiness_only",
      api_key_present: false,
      api_authenticated: false,
      webhook_secret_present: webhookSecretPresent,
      blockers: ["missing_LEMON_SQUEEZY_API_KEY"],
    }, { headers: { "Cache-Control": "no-store" } });
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

    if (storeId) {
      const lemonProducts = await listLemonProducts(storeId);
      const configuredProductId = text(productRecord?.fields?.["Lemon Squeezy Product ID"] || config.lemon_product_id);
      const lemonProduct = lemonProducts.find((item) => lemonResourceId(item) === configuredProductId)
        || lemonProducts.find((item) => /hibou/i.test(lemonResourceName(item)))
        || lemonProducts[0]
        || null;
      productId = lemonResourceId(lemonProduct);
      productName = lemonResourceName(lemonProduct);

      if (productId) {
        const variants = await listLemonVariants(productId);
        const configuredVariantId = text(productRecord?.fields?.["Lemon Squeezy Variant ID"] || config.lemon_variant_id);
        const variant = variants.find((item) => lemonResourceId(item) === configuredVariantId)
          || variants.find((item) => Number(item?.attributes?.price) === 2900)
          || variants[0]
          || null;
        variantId = lemonResourceId(variant);
        variantPriceCents = Number.isFinite(Number(variant?.attributes?.price)) ? Number(variant?.attributes?.price) : null;
      }
    }

    return NextResponse.json({
      ok: true,
      mode: "readiness_only",
      api_key_present: true,
      api_authenticated: true,
      webhook_secret_present: webhookSecretPresent,
      store_count: stores.length,
      store_id: storeId,
      product_id: productId,
      product_name: productName,
      variant_id: variantId,
      variant_price_cents: variantPriceCents,
      expected_store_id: configuredStoreId,
      expected_product_id: text(productRecord?.fields?.["Lemon Squeezy Product ID"] || config.lemon_product_id),
      expected_variant_id: text(productRecord?.fields?.["Lemon Squeezy Variant ID"] || config.lemon_variant_id),
      blockers: [],
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      ok: true,
      mode: "readiness_only",
      api_key_present: true,
      api_authenticated: false,
      webhook_secret_present: webhookSecretPresent,
      error: String(error?.message || error).slice(0, 500),
      blockers: ["lemon_api_auth_failed"],
    }, { headers: { "Cache-Control": "no-store" } });
  }
}
