import { digifyReadiness } from "./digify-config.mjs";
import { resolveLemonWebhookSecret } from "./commerce.mjs";

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
    return url.protocol === "https:" && ["svc.digify.com", "api.digify.com"].includes(url.hostname.toLowerCase()) ? url.toString() : "";
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
  lemonAdd("webhook_secret", Boolean(text(resolveLemonWebhookSecret(env))), "Secret webhook Lemon présent côté serveur");
  lemonAdd("test_webhook", Boolean(text(config.lemon_test_webhook_id) && text(config.lemon_webhook_status) === "TEST_READY"), "Webhook Lemon test order_created/order_refunded prêt");

  const digifyRuntime = digifyReadiness(env);
  const digifyChecks = [];
  const digifyAdd = (key, ok, detail) => digifyChecks.push({ key, ok: Boolean(ok), detail });
  digifyAdd("credentials", digifyRuntime.credentials_present, "Credentials Digify présents côté serveur");
  digifyAdd("file_guid", Boolean(text(product["Digify File GUID"])), "Fichier de test Digify identifié");
  digifyAdd("add_recipient_endpoint", Boolean(digifyApiUrl(digifyRuntime.add_recipient_endpoint)), "Endpoint officiel d'ajout destinataire Digify disponible");
  digifyAdd("add_recipient_contract", digifyRuntime.recipient_contract_builtin, "Contrat officiel d'ajout destinataire intégré au runtime");
  digifyAdd("revoke_endpoint", Boolean(digifyApiUrl(digifyRuntime.revoke_recipient_endpoint)), "Endpoint officiel de retrait destinataire Digify disponible");
  digifyAdd("revoke_contract", digifyRuntime.revocation_contract_builtin, "Contrat officiel de retrait destinataire intégré au runtime");
  digifyAdd("activity_webhook_auth", digifyRuntime.webhook_auth_ready, `Basic Auth du webhook d'activité Digify prête (${digifyRuntime.webhook_auth_source})`);
  digifyAdd("access_mode", text(config.digify_test_access_mode) === "QUICK_ACCESS_LINK", "Quick Access Link configuré comme mode de test");
  digifyAdd("permissions", /download=false/i.test(text(config.digify_test_permissions)) && /print=false/i.test(text(config.digify_test_permissions)), "Téléchargement et impression désactivés pour le test");

  return {
    lemon: readinessGroup(lemonChecks),
    digify: readinessGroup(digifyChecks),
  };
}

export function commercialReadiness({ config = {}, product = {}, chapters = [], legal = [], env = process.env } = {}) {
  const checks = [];
  const mode = text(config.commerce_readiness_mode).toLowerCase();
  const earlyAccess = mode === "early_access";
  const add = (key, ok, detail, blocking = true) => checks.push({ key, ok: Boolean(ok), detail, blocking: Boolean(blocking) });

  const provider = text(config.payment_provider);
  const checkout = provider === "lemon_squeezy" ? lemonCheckoutUrl(config.checkout_url || product["Lemon Squeezy Checkout URL"]) : "";
  const edition = text(config.book_current_edition);
  const publicSite = httpsUrl(config.public_site_url);
  const expectedHost = text(config.public_site_host_expected || "d4d5d6.com").toLowerCase();
  let publicHost = "";
  try { publicHost = new URL(publicSite).hostname.toLowerCase(); } catch {}
  const domainVerified = bool(config.domain_verified) && Boolean(publicSite) && publicHost === expectedHost;
  const completeBook = chapters.length >= 16 && chapters.every(chapterReady);
  const deliveryMode = text(config.delivery_provider_mode || "digify").toLowerCase();
  const deliveryModeValid = ["digify", "lemon_native"].includes(deliveryMode);
  const digifyRuntime = digifyReadiness(env);

  add("launch_authorized", bool(config.commerce_launch_authorized), "Autorisation commerciale explicite");
  add("readiness_mode", mode === "strict" || earlyAccess, earlyAccess ? "Mode early-access explicite actif" : "Mode strict actif");
  add("domain_verified", domainVerified, `Domaine public ${expectedHost} vérifié et canonique`);
  add("payment_provider", provider === "lemon_squeezy", "Lemon Squeezy est le seul provider public autorisé");
  add("checkout_url", Boolean(checkout), "URL checkout HTTPS live");
  add("live_checkout_verified", Boolean(text(config.lemon_live_checkout_id)) && text(config.lemon_checkout_status) === "LIVE_PUBLIC", "Checkout Lemon live personnalisé vérifié");
  add("lemon_variant", Boolean(text(product["Lemon Squeezy Variant ID"])), "Variant ID du produit 29 €");
  add("lemon_webhook", Boolean(text(resolveLemonWebhookSecret(env))), "Secret webhook Lemon présent côté serveur");
  add("book_edition", Boolean(edition) && !edition.toLowerCase().includes("draft"), earlyAccess ? "Édition early-access identifiée" : "Édition finale non draft");
  add("book_complete", completeBook, `${chapters.filter(chapterReady).length}/${chapters.length || 16} chapitres prêts export`, !earlyAccess);
  add("delivery_provider", deliveryModeValid, deliveryModeValid ? `Provider de livraison: ${deliveryMode}` : `Provider de livraison invalide: ${deliveryMode || "vide"}`);
  if (deliveryMode === "digify") {
    add("digify_delivery_available", ["CONNECTED_PRODUCTION_TESTED", "ACTIVE"].includes(text(config.digify_api_status).toUpperCase()), "Digify actuellement disponible pour la livraison commerciale");
    add("digify_file", Boolean(text(product["Digify File GUID"])), "PDF maître chargé dans Digify");
    add("digify_api", Boolean(
      digifyRuntime.credentials_present
      && digifyApiUrl(digifyRuntime.add_recipient_endpoint)
      && digifyRuntime.recipient_contract_builtin
      && digifyApiUrl(digifyRuntime.revoke_recipient_endpoint)
      && digifyRuntime.revocation_contract_builtin
      && digifyRuntime.webhook_auth_ready
    ), "API de livraison, révocation et webhook Digify entièrement configurée");
  } else if (deliveryMode === "lemon_native") {
    add(
      "lemon_native_delivery",
      bool(config.lemon_native_delivery_verified),
      "Fichier exact de l’édition vendu vérifié sur le variant Lemon et accès My Orders accepté comme mode de livraison",
    );
  }
  add(
    "digital_supply_consent_durable_confirmation",
    bool(config.digital_supply_consent_durable_confirmation_tested),
    "Consentement exprès au commencement immédiat + reconnaissance de la conséquence sur la rétractation + confirmation durable testés et rattachables à une commande",
    true,
  );
  add(
    "withdrawal_durable_receipt",
    bool(config.withdrawal_durable_receipt_tested),
    earlyAccess
      ? "Accusé durable non encore testé : tant que les conditions légales de renonciation ne sont pas réunies, le droit de rétractation n'est pas présenté comme perdu"
      : "Accusé de réception durable de la rétractation testé de bout en bout",
    !earlyAccess,
  );

  for (const item of CRITICAL_LEGAL) {
    add(`legal:${item}`, legalStatus(legal, item) === "Validé", `${item} validé`, !earlyAccess);
  }

  const blockers = checks.filter((check) => !check.ok && check.blocking);
  const warnings = checks.filter((check) => !check.ok && !check.blocking);
  return {
    ready: blockers.length === 0,
    checkoutUrl: blockers.length === 0 ? checkout : "",
    checks,
    blockers,
    warnings,
    mode,
    earlyAccess,
    readyBookChapters: chapters.filter(chapterReady).length,
    totalBookChapters: chapters.length,
    edition,
    publicSite,
    expectedHost,
    deliveryMode,
  };
}

export { CRITICAL_LEGAL };
