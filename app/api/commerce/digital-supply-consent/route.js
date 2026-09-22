import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { configMap, createRecord, queryAllRecords, TABLES } from "../../../../lib/airtable";
import { createLiveLemonCheckout, createTestLemonCheckout } from "../../../../lib/lemon-api.mjs";
import { DIGITAL_SUPPLY_CONSENT_VERSION, digitalSupplyCustomData } from "../../../../lib/digital-supply-consent.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAX_BODY_BYTES = 4_000;
const ALLOWED_ORIGINS = new Set(["https://d4d5d6.com", "https://www.d4d5d6.com", "https://le-hibou-ruse-site.vercel.app"]);
const RECEIPT_CONFIRMATION = "Vous avez demandé le commencement immédiat de la fourniture du guide numérique et reconnu la conséquence de cette demande sur votre droit de rétractation lorsque les conditions légales applicables sont réunies. Conservez cet e-mail et votre référence de commande.";

function clean(value) { return String(value ?? "").trim(); }
function truthy(value) { return ["1","true","yes","oui","on"].includes(clean(value).toLowerCase()); }
function allowedOrigin(request) {
  const origin = clean(request.headers.get("origin"));
  if (!origin) return false;
  try { return ALLOWED_ORIGINS.has(new URL(origin).origin); } catch { return false; }
}
function publicBase(config) {
  const raw = clean(config.public_site_url) || "https://d4d5d6.com";
  const url = new URL(raw);
  if (url.protocol !== "https:") throw new Error("public_site_url doit être HTTPS");
  return url.origin;
}
async function state() {
  const records = await queryAllRecords(TABLES.configuration, {}, { maxRecords: 500 });
  return configMap(records);
}
async function journalConsent({ consentId, consentAt, version, mode, checkoutId }) {
  await createRecord(TABLES.journal, {
    Workflow: "HIBOU_DIGITAL_SUPPLY_CONSENT_V1",
    Déclencheur: "Parcours achat guide",
    Action: "consent_collected_before_checkout",
    Statut: "Completed",
    "Dernière exécution": consentAt,
    "ID externe": consentId,
    Notes: `consent_version=${version}; immediate_supply_consent=true; withdrawal_loss_ack=true; checkout_mode=${mode}; checkout_id=${checkoutId || ""}; pii_collected=false`,
  });
}

export async function POST(request) {
  if (!allowedOrigin(request)) return NextResponse.json({ ok: false, error: "Origin refused" }, { status: 403 });
  const contentType = clean(request.headers.get("content-type")).toLowerCase();
  if (!contentType.includes("application/json")) return NextResponse.json({ ok: false, error: "Format invalide" }, { status: 415 });
  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return NextResponse.json({ ok: false, error: "Requête trop volumineuse" }, { status: 413 });
  let body = {};
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: false, error: "JSON invalide" }, { status: 400 }); }
  if (body.immediate_supply_consent !== true || body.withdrawal_loss_ack !== true) {
    return NextResponse.json({ ok: false, error: "Les deux consentements explicites sont requis" }, { status: 422 });
  }

  try {
    const config = await state();
    const mode = clean(config.digital_supply_consent_checkout_mode).toLowerCase();
    if (!["test","live"].includes(mode)) return NextResponse.json({ ok: false, error: "Parcours de consentement désactivé" }, { status: 409 });
    const version = clean(config.digital_supply_consent_version) || DIGITAL_SUPPLY_CONSENT_VERSION;
    if (version !== DIGITAL_SUPPLY_CONSENT_VERSION) throw new Error(`Version de consentement non prise en charge: ${version}`);

    const consentId = randomUUID();
    const consentAt = new Date().toISOString();
    const checkoutCustomData = digitalSupplyCustomData({ consentId, consentAt, version });
    const base = publicBase(config);
    const common = {
      productName: clean(config.lemon_product_name) || "Guide du Hibou Rusé",
      description: clean(config.lemon_product_description) || "Le Guide du Hibou Rusé — édition numérique disponible à cette date, susceptible de mises à jour ultérieures.",
      redirectUrl: `${base}/merci?order=[order_identifier]`,
      receiptLinkUrl: `${base}/merci?order=[order_identifier]`,
      receiptButtonText: clean(config.lemon_receipt_button_text) || "Lire mon guide",
      receiptThankYouNote: RECEIPT_CONFIRMATION,
      checkoutCustomData,
    };

    let checkout;
    if (mode === "test") {
      const apiKey = clean(process.env.LEMON_SQUEEZY_TEST_API_KEY);
      if (!apiKey) throw new Error("LEMON_SQUEEZY_TEST_API_KEY absent");
      checkout = await createTestLemonCheckout({
        ...common,
        storeId: clean(config.lemon_test_store_id),
        variantId: clean(config.lemon_test_variant_id),
      }, { apiKey });
    } else {
      if (!truthy(config.commerce_launch_authorized)) throw new Error("commerce_launch_authorized=false");
      if (!truthy(config.digital_supply_consent_durable_confirmation_tested)) throw new Error("preuve durable du parcours de consentement non validée");
      checkout = await createLiveLemonCheckout({
        ...common,
        storeId: clean(config.lemon_store_id),
        variantId: clean(config.lemon_variant_id),
      });
    }

    await journalConsent({ consentId, consentAt, version, mode, checkoutId: checkout.id });
    return NextResponse.json({ ok: true, mode, consent_id: consentId, checkout_url: checkout.url }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: clean(error?.message || error).slice(0,700) }, { status: 412 });
  }
}
