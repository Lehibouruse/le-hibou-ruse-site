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

export function commercialReadiness({ config = {}, product = {}, chapters = [], legal = [], env = process.env } = {}) {
  const checks = [];
  const add = (key, ok, detail) => checks.push({ key, ok: Boolean(ok), detail });

  const provider = text(config.payment_provider);
  const checkout = provider === "lemon_squeezy" ? httpsUrl(config.checkout_url || product["Lemon Squeezy Checkout URL"]) : "";
  const edition = text(config.book_current_edition);
  const completeBook = chapters.length >= 16 && chapters.every(chapterReady);

  add("launch_authorized", bool(config.commerce_launch_authorized), "Autorisation commerciale explicite");
  add("readiness_mode", text(config.commerce_readiness_mode).toLowerCase() === "strict", "Mode strict actif");
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
  };
}

export { CRITICAL_LEGAL };
