const CRITICAL_LEGAL = [
  "Avertissement éditorial fiscal/juridique",
  "CGV produit numérique",
  "Mentions légales conformes",
  "Politique de confidentialité et cookies",
];

function text(value) {
  return String(value ?? "").trim();
}

function bool(value) {
  if (value === true || value === false) return value;
  return ["1", "true", "yes", "oui", "on"].includes(text(value).toLowerCase());
}

function selectName(value) {
  return value?.name || value || "";
}

function httpsUrl(value) {
  try {
    const url = new URL(text(value));
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function lemonCheckoutUrl(value) {
  try {
    const url = new URL(text(value));
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && (host === "lemonsqueezy.com" || host.endsWith(".lemonsqueezy.com")) ? url.toString() : "";
  } catch {
    return "";
  }
}

function digifyApiUrl(value) {
  try {
    const url = new URL(text(value));
    return url.protocol === "https:" && url.hostname.toLowerCase() === "api.digify.com" ? url.toString() : "";
  } catch {
    return "";
  }
}

function legalStatus(records, name) {
  const record = (records || []).find((item) => text(item?.fields?.Élément) === name);
  return text(selectName(record?.fields?.Statut));
}

function chapterReady(record) {
  const fields = record?.fields || {};
  return Boolean(
    text(fields["Contenu V1"])
    && fields["Validation humaine"] === true
    && fields["Prêt export"] === true
    && text(fields["QC éditorial"]).toLowerCase() !== "fail",
  );
}

function readinessGroup(checks) {
  const blockers = checks.filter((item) => !item.ok);
  return { ready: blockers.length === 0, checks, blockers };
}

export function commerceTestReadiness({ config = {}, product = {}, env = process.env } = {}) {
  const lemonChecks = [];
  const lemonAdd = (key, ok, detail) => lemonChecks.push({ key, ok: Boolean(ok), detail });
  const testCheckout = lemonCheckoutUrl(config.lemon_test_checkout_url);

  lemonAdd("test_only_lock", bool(config.lemon_test_mode_only), "Verrou Lemon test-only actif");
  lemonAdd("api_key", Boolean(text(env.LEMON_SQUEEZY_API_KEY)), "Clé API Lemon présente côté serveur");
  lemonAdd("store_id", Boolean(text(config.lemon_store_id)), "Store ID Lemon découvert par API");
  lemonAdd("product_id", Boolean(text(product["Lemon Squeezy Product ID"] || config.lemon_product_id)), "Product ID Lemon connu");
  lemonAdd("variant_id", Boolean(text(product["Lemon Squeezy Variant ID"] || config.lemon_variant_id)), "Variant ID 29 € connu");
  lemonAdd("test_checkout", Boolean(text(config.lemon_test_checkout_id) && testCheckout && text(config.lemon_checkout_status) === "TEST_READY"), "Checkout test Lemon vérifié et prêt");
  lemonAdd("webhook_secret", Boolean(text(env.LEMON_SQUEEZY_WEBHOOK_SECRET)), "Secret webhook Lemon présent côté serveur");
  lemonAdd("test_webhook", Boolean(text(config.lemon_test_webhook_id) && text(config.lemon_webhook_status) === "TEST_READY"), "Webhook Lemon test order_created/order_refunded prêt");

  const digifyChecks = [];
  const digifyAdd = (key, ok, detail) => digifyChecks.push({ key, ok: Boolean(ok), detail });
  digifyAdd("credentials", Boolean(text(env.DIGIFY_KEY_ID) && text(env.DIGIFY_SECRET)), "Credentials Digify présents côté serveur");
  digifyAdd("file_guid", Boolean(text(product["Digify File GUID"])), "Fichier de test Digify identifié");
  digifyAdd("add_recipient_template", Boolean(text(env.DIGIFY_ADD_RECIPIENT_BODY_TEMPLATE)), "Payload officiel d'ajout destinataire configuré");
  digifyAdd("revoke_endpoint", Boolean(digifyApiUrl(env.DIGIFY_REVOKE_RECIPIENT_URL)), "Endpoint officiel de révocation Digify configuré");
  digifyAdd("revoke_template", Boolean(text(env.DIGIFY_REVOKE_RECIPIENT_BODY_TEMPLATE)), "Payload officiel de révocation configuré");
  digifyAdd("access_mode", text(config.digify_test_access_mode) === "QUICK_ACCESS_LINK", "Quick Access Link configuré comme mode de test");
  digifyAdd("permissions", /download=false/i.test(text(config.digify_test_permissions)) && /print=false/i.test(text(config.digify_test_permissions)), "Téléchargement et impression désactivés pour le test");

  return {
    lemon: readinessGroup(lemonChecks),
    digify: readinessGroup(digifyChecks),
  };
}

export function commercialReadiness({ config = {}, product = {}, chapters = [], legal = [], env = process.env } = {}) {
  const checks = [];
  const add = (key, ok, detail) => checks.push({ key, ok: Boolean(ok), detail });

  const provider = text(config.payment_provider);
  const checkout = provider === "lemon_squeezy" ? httpsUrl(config.checkout_url || product["Lemon Squeezy Checkout URL"]) : "";
  const edition = text(config.book_current_edition);
  const publicSite = httpsUrl(config.public_site_url);
  const expectedHost = text(config.public_site_host_expected || "d4d5d6.com").toLowerCase();
  let publicHost = "";
  try { publicHost = new URL(publicSite).hostname.toLowerCase(); } catch {}
  const domainVerified = bool(config.domain_verified) && Boolean(publicSite) && publicHost === expectedHost;
  const completeBook = chapters.length >= 16 && chapters.every(chapterReady);

  add("launch_authorized", bool(config.commerce_launch_authorized), "Autorisation commerciale explicite");
  add("readiness_mode", text(config.commerce_readiness_mode).toLowerCase() === "strict", "Mode strict actif");
  add("domain_verified", domainVerified, `Domaine public ${expectedHost} vérifié et canonique`);
  add("payment_provider", provider === "lemon_squeezy", "Lemon Squeezy est le seul provider public autorisé");
  add("checkout_url", Boolean(checkout), "URL checkout HTTPS live");
  add("lemon_variant", Boolean(text(product["Lemon Squeezy Variant ID"])), "Variant ID du produit 29 €");
  add("lemon_webhook", Boolean(text(env.LEMON_SQUEEZY_WEBHOOK_SECRET)), "Secret webhook Lemon présent côté serveur");
  add("book_edition", Boolean(edition) && !edition.toLowerCase().includes("draft"), "Édition finale non draft");
  add("book_complete", completeBook, `${chapters.filter(chapterReady).length}/${chapters.length || 16} chapitres prêts export`);
  add("digify_file", Boolean(text(product["Digify File GUID"])), "PDF maître chargé dans Digify");
  add("digify_api", Boolean(text(env.DIGIFY_KEY_ID) && text(env.DIGIFY_SECRET) && text(env.DIGIFY_ADD_RECIPIENT_BODY_TEMPLATE)), "API de livraison Digify configurée");

  for (const item of CRITICAL_LEGAL) {
    add(`legal:${item}`, legalStatus(legal, item) === "Validé", `${item} validé`);
  }

  const blockers = checks.filter((check) => !check.ok);
  return {
    ready: blockers.length === 0,
    checkoutUrl: blockers.length === 0 ? checkout : "",
    checks,
    blockers,
    readyBookChapters: chapters.filter(chapterReady).length,
    totalBookChapters: chapters.length,
    edition,
    publicSite,
    expectedHost,
  };
}

export { CRITICAL_LEGAL };
