const API_BASE = "https://api.lemonsqueezy.com";

function text(value) {
  return String(value ?? "").trim();
}

function requireId(value, label) {
  const id = text(value);
  if (!/^\d+$/.test(id)) throw new Error(`${label} invalide`);
  return id;
}

function requireCheckoutId(value) {
  const id = text(value);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
    throw new Error("Checkout ID Lemon invalide");
  }
  return id;
}

function httpsUrl(value, label) {
  let url;
  try { url = new URL(text(value)); }
  catch { throw new Error(`${label} invalide`); }
  if (url.protocol !== "https:") throw new Error(`${label} doit être HTTPS`);
  return url.toString();
}

export function lemonApiHeaders(apiKey = process.env.LEMON_SQUEEZY_API_KEY) {
  const key = text(apiKey);
  if (!key) throw new Error("LEMON_SQUEEZY_API_KEY absent");
  return {
    Accept: "application/vnd.api+json",
    "Content-Type": "application/vnd.api+json",
    Authorization: `Bearer ${key}`,
  };
}

function lemonUrl(path, query = {}) {
  const rawPath = text(path);
  if (!rawPath.startsWith("/v1/")) throw new Error("Chemin Lemon refusé");
  const url = new URL(rawPath, API_BASE);
  if (url.origin !== API_BASE) throw new Error("Hôte Lemon refusé");
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export async function lemonRequest(path, {
  method = "GET",
  query = {},
  body,
  apiKey = process.env.LEMON_SQUEEZY_API_KEY,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== "function") throw new Error("fetch Lemon indisponible");

  // Configuration/validation errors are deterministic and must not be disguised
  // as transport failures. Build URL and auth headers before entering the network try.
  const url = lemonUrl(path, query);
  const headers = lemonApiHeaders(apiKey);

  let response;
  try {
    response = await fetchImpl(url, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      cache: "no-store",
    });
  } catch (cause) {
    const error = new Error("Lemon API: erreur réseau");
    error.cause = cause;
    error.ambiguous = method !== "GET";
    throw error;
  }

  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; }
  catch { data = { raw: raw.slice(0, 1000) }; }

  if (!response.ok) {
    const detail = data?.errors?.[0]?.detail || data?.message || data?.error || data?.raw || response.statusText;
    const error = new Error(`Lemon API ${response.status}: ${String(detail || "unknown").slice(0, 700)}`);
    error.status = response.status;
    error.retryable = response.status === 429;
    error.ambiguous = method !== "GET" && (response.status === 408 || response.status >= 500);
    throw error;
  }
  return data;
}

export async function listLemonStores(options = {}) {
  const data = await lemonRequest("/v1/stores", { ...options, query: { "page[size]": 100, ...(options.query || {}) } });
  return Array.isArray(data?.data) ? data.data : [];
}

export async function listLemonProducts(storeId, options = {}) {
  const data = await lemonRequest("/v1/products", {
    ...options,
    query: { "filter[store_id]": requireId(storeId, "Store ID"), "page[size]": 100, ...(options.query || {}) },
  });
  return Array.isArray(data?.data) ? data.data : [];
}

export async function listLemonVariants(productId, options = {}) {
  const data = await lemonRequest("/v1/variants", {
    ...options,
    query: { "filter[product_id]": requireId(productId, "Product ID"), "page[size]": 100, ...(options.query || {}) },
  });
  return Array.isArray(data?.data) ? data.data : [];
}

export async function listLemonWebhooks(storeId, options = {}) {
  const data = await lemonRequest("/v1/webhooks", {
    ...options,
    query: { "filter[store_id]": requireId(storeId, "Store ID"), "page[size]": 100, ...(options.query || {}) },
  });
  return Array.isArray(data?.data) ? data.data : [];
}

export async function retrieveLemonCheckout(checkoutId, options = {}) {
  const id = requireCheckoutId(checkoutId);
  const data = await lemonRequest(`/v1/checkouts/${encodeURIComponent(id)}`, options);
  return data?.data || null;
}

export function buildTestCheckoutPayload({
  storeId,
  variantId,
  productName,
  description,
  redirectUrl,
  receiptButtonText = "Lire mon guide",
  receiptLinkUrl,
  receiptThankYouNote = "",
} = {}) {
  const store = requireId(storeId, "Store ID");
  const variant = requireId(variantId, "Variant ID");
  const redirect = httpsUrl(redirectUrl, "Redirect URL");
  const receipt = httpsUrl(receiptLinkUrl || redirectUrl, "Receipt URL");
  return {
    data: {
      type: "checkouts",
      attributes: {
        test_mode: true,
        product_options: {
          name: text(productName),
          description: text(description),
          redirect_url: redirect,
          receipt_button_text: text(receiptButtonText) || "Lire mon guide",
          receipt_link_url: receipt,
          receipt_thank_you_note: text(receiptThankYouNote),
          enabled_variants: [Number(variant)],
        },
        checkout_options: {
          embed: false,
          media: true,
          logo: true,
          desc: true,
          discount: false,
          locale: "fr",
        },
      },
      relationships: {
        store: { data: { type: "stores", id: store } },
        variant: { data: { type: "variants", id: variant } },
      },
    },
  };
}

export async function createTestLemonCheckout(input, options = {}) {
  const payload = buildTestCheckoutPayload(input);
  const data = await lemonRequest("/v1/checkouts", { ...options, method: "POST", body: payload });
  const checkout = data?.data || {};
  if (checkout?.attributes?.test_mode !== true) throw new Error("Lemon checkout refusé: test_mode non confirmé");
  const url = httpsUrl(checkout?.attributes?.url, "Checkout URL Lemon");
  return { id: text(checkout?.id), url, data: checkout };
}


export function buildLiveCheckoutPayload(input = {}) {
  const description = text(input.description);
  if (!/partielle?/i.test(description)) throw new Error("Checkout live: mention explicite de la version partielle requise");
  const payload = buildTestCheckoutPayload({ ...input, description });
  payload.data.attributes.test_mode = false;
  return payload;
}

export async function createLiveLemonCheckout(input, options = {}) {
  const payload = buildLiveCheckoutPayload(input);
  const data = await lemonRequest("/v1/checkouts", { ...options, method: "POST", body: payload });
  const checkout = data?.data || {};
  if (checkout?.attributes?.test_mode !== false) throw new Error("Lemon checkout live refusé: test_mode=false non confirmé");
  if (String(checkout?.attributes?.store_id ?? "") !== String(input.storeId)) throw new Error("Lemon checkout live: Store ID différent");
  if (String(checkout?.attributes?.variant_id ?? "") !== String(input.variantId)) throw new Error("Lemon checkout live: Variant ID différent");
  const url = httpsUrl(checkout?.attributes?.url, "Checkout URL Lemon");
  const host = new URL(url).hostname.toLowerCase();
  if (host !== "lemonsqueezy.com" && !host.endsWith(".lemonsqueezy.com")) throw new Error("Checkout live: hôte Lemon invalide");
  return { id: text(checkout?.id), url, data: checkout };
}

export function buildTestWebhookPayload({ storeId, url, events = ["order_created", "order_refunded"], secret } = {}) {
  const store = requireId(storeId, "Store ID");
  const endpoint = httpsUrl(url, "Webhook URL");
  const signingSecret = text(secret);
  if (signingSecret.length < 6 || signingSecret.length > 40) throw new Error("Secret webhook Lemon: longueur 6-40 requise");
  const normalizedEvents = [...new Set((events || []).map(text).filter(Boolean))];
  if (!normalizedEvents.includes("order_created") || !normalizedEvents.includes("order_refunded")) {
    throw new Error("Webhook Lemon: order_created et order_refunded requis");
  }
  return {
    data: {
      type: "webhooks",
      attributes: {
        url: endpoint,
        events: normalizedEvents,
        secret: signingSecret,
        test_mode: true,
      },
      relationships: {
        store: { data: { type: "stores", id: store } },
      },
    },
  };
}

export async function createTestLemonWebhook(input, options = {}) {
  const payload = buildTestWebhookPayload(input);
  const data = await lemonRequest("/v1/webhooks", { ...options, method: "POST", body: payload });
  const webhook = data?.data || {};
  if (webhook?.attributes?.test_mode !== true) throw new Error("Lemon webhook refusé: test_mode non confirmé");
  return { id: text(webhook?.id), data: webhook };
}

export function lemonResourceId(resource) {
  return text(resource?.id);
}

export function lemonResourceName(resource) {
  return text(resource?.attributes?.name);
}
