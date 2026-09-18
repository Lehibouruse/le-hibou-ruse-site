import { NextResponse } from "next/server";
import { configMap, queryRecords, TABLES } from "../../../../lib/airtable";
import { DIGIFY_ADD_RECIPIENT_DEFAULT_URL, digifyReadiness } from "../../../../lib/digify-config.mjs";
import { verifyGithubActionsToken } from "../../../../lib/github-oidc.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const OIDC_WORKFLOW = "digify-readiness.yml";

function text(value) { return String(value ?? "").trim(); }
function truthy(value) { return ["1", "true", "yes", "oui", "on"].includes(text(value).toLowerCase()); }

async function authenticate(request) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) throw new Error("Unauthorized");
  await verifyGithubActionsToken(auth.slice("Bearer ".length), {
    allowedWorkflowFiles: [OIDC_WORKFLOW],
    allowedEvents: ["workflow_dispatch", "push"],
  });
}

function selectCommerceProduct(products = []) {
  return products.find((record) => text(record?.fields?.["Lemon Product ID"]))
    || products.find((record) => /guide du hibou rusé/i.test(text(record?.fields?.Produit)))
    || products[0]
    || null;
}

function nextAction(blockers) {
  const first = blockers[0] || "";
  const messages = {
    missing_DIGIFY_KEY_ID: "Vérifier que DIGIFY_KEY_ID est lié au projet Vercel en Production.",
    missing_DIGIFY_SECRET: "Vérifier que DIGIFY_SECRET est lié au projet Vercel en Production.",
    missing_add_recipient_template: "Capturer le payload officiel /v1/file/recipient/add depuis le Developer Portal Digify.",
    missing_file_guid: "Charger le PDF dans Digify puis enregistrer son File GUID dans Produits site.",
    missing_revoke_endpoint: "Capturer l'endpoint officiel de révocation destinataire depuis le Developer Portal Digify.",
    missing_revoke_template: "Capturer le payload officiel de révocation destinataire depuis le Developer Portal Digify.",
    webhook_auth_not_ready: "Vérifier CRON_SECRET ou le couple DIGIFY_WEBHOOK_USERNAME/DIGIFY_WEBHOOK_PASSWORD.",
  };
  return messages[first] || "Aucun blocage technique détecté. Conserver commerce_launch_authorized=false jusqu'au test contrôlé.";
}

export async function POST(request) {
  try {
    await authenticate(request);
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const [configuration, products] = await Promise.all([
    queryRecords(TABLES.configuration, { pageSize: 100, priorityAware: false }),
    queryRecords(TABLES.products, { filterByFormula: "{Actif}=1", pageSize: 20, priorityAware: false }),
  ]);
  const config = configMap(configuration);
  const product = selectCommerceProduct(products);
  const runtime = digifyReadiness(process.env);
  const keyIdPresent = Boolean(text(process.env.DIGIFY_KEY_ID));
  const secretPresent = Boolean(text(process.env.DIGIFY_SECRET));
  const fileGuid = text(product?.fields?.["Digify File GUID"]);
  const launchAuthorized = truthy(config.commerce_launch_authorized);

  const blockers = [];
  if (!keyIdPresent) blockers.push("missing_DIGIFY_KEY_ID");
  if (!secretPresent) blockers.push("missing_DIGIFY_SECRET");
  if (!runtime.add_template_present) blockers.push("missing_add_recipient_template");
  if (!fileGuid) blockers.push("missing_file_guid");
  if (!runtime.revoke_endpoint_present) blockers.push("missing_revoke_endpoint");
  if (!runtime.revoke_template_present) blockers.push("missing_revoke_template");
  if (!runtime.webhook_auth_ready) blockers.push("webhook_auth_not_ready");

  const recipientContractReady = Boolean(runtime.credentials_present && runtime.add_template_present);
  const revocationContractReady = Boolean(
    runtime.credentials_present
      && runtime.revoke_endpoint_present
      && runtime.revoke_template_present
  );
  const deliveryRuntimeReady = Boolean(recipientContractReady && fileGuid);
  const revocationRuntimeReady = Boolean(revocationContractReady && fileGuid);

  const result = {
    ok: true,
    mode: "readiness_only",
    side_effects_enabled: false,
    credentials_present: runtime.credentials_present,
    key_id_present: keyIdPresent,
    secret_present: secretPresent,
    add_recipient_endpoint: runtime.add_recipient_endpoint || DIGIFY_ADD_RECIPIENT_DEFAULT_URL,
    add_template_present: runtime.add_template_present,
    revoke_endpoint_present: runtime.revoke_endpoint_present,
    revoke_template_present: runtime.revoke_template_present,
    webhook_auth_ready: runtime.webhook_auth_ready,
    webhook_auth_source: runtime.webhook_auth_source,
    webhook_endpoint: "https://le-hibou-ruse-site.vercel.app/api/commerce/digify-webhook",
    file_guid_present: Boolean(fileGuid),
    selected_product: text(product?.fields?.Produit),
    recipient_contract_ready: recipientContractReady,
    revocation_contract_ready: revocationContractReady,
    delivery_runtime_ready: deliveryRuntimeReady,
    revocation_runtime_ready: revocationRuntimeReady,
    commerce_launch_authorized: launchAuthorized,
    delivery_ready: Boolean(deliveryRuntimeReady && launchAuthorized),
    revocation_ready: revocationRuntimeReady,
    blockers,
    blocker_count: blockers.length,
    next_action: nextAction(blockers),
  };

  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
