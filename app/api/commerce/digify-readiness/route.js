import { NextResponse } from "next/server";
import { configMap, queryRecords, TABLES } from "../../../../lib/airtable";
import { DIGIFY_ADD_RECIPIENT_DEFAULT_URL, DIGIFY_REVOKE_RECIPIENT_DEFAULT_URL, digifyReadiness } from "../../../../lib/digify-config.mjs";
import { searchDigifyFiles } from "../../../../lib/commerce.mjs";
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
    missing_file_guid: "Charger le PDF dans Digify puis enregistrer son File GUID dans Produits site.",
    webhook_auth_not_ready: "Vérifier CRON_SECRET ou le couple DIGIFY_WEBHOOK_USERNAME/DIGIFY_WEBHOOK_PASSWORD.",
    digify_api_probe_failed: "La clé Digify ne permet pas de rechercher les fichiers envoyés.",
    file_guid_mismatch: "Le File GUID Airtable ne correspond pas au fichier Hibou retrouvé par l’API Digify.",
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
  if (!fileGuid) blockers.push("missing_file_guid");
  if (!runtime.webhook_auth_ready) blockers.push("webhook_auth_not_ready");

  let apiProbeOk = false;
  let discoveredFileGuid = "";
  let discoveredFileName = "";
  let fileGuidMatchesSearch = false;
  let apiProbeError = "";
  if (runtime.credentials_present) {
    try {
      const probe = await searchDigifyFiles({ searchQuery: "Hibou", pageIndex: 0, pageSize: 40 });
      apiProbeOk = true;
      const files = probe.files || [];
      const exact = files.find((item) => text(item?.Guid) === fileGuid);
      const candidate = exact || files.find((item) => /hibou/i.test(text(item?.Name))) || files[0] || null;
      discoveredFileGuid = text(candidate?.Guid);
      discoveredFileName = text(candidate?.Name);
      fileGuidMatchesSearch = Boolean(fileGuid && exact);
      if (fileGuid && files.length && !fileGuidMatchesSearch) blockers.push("file_guid_mismatch");
    } catch (error) {
      apiProbeError = String(error?.message || error).slice(0, 300);
      blockers.push("digify_api_probe_failed");
    }
  }

  const recipientContractReady = Boolean(runtime.credentials_present && apiProbeOk && fileGuidMatchesSearch);
  const revocationContractReady = Boolean(runtime.credentials_present && apiProbeOk && fileGuidMatchesSearch);
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
    revoke_recipient_endpoint: runtime.revoke_recipient_endpoint || DIGIFY_REVOKE_RECIPIENT_DEFAULT_URL,
    recipient_contract_builtin: runtime.recipient_contract_builtin,
    revocation_contract_builtin: runtime.revocation_contract_builtin,
    api_probe_ok: apiProbeOk,
    discovered_file_guid: discoveredFileGuid,
    discovered_file_name: discoveredFileName,
    file_guid_matches_search: fileGuidMatchesSearch,
    api_probe_error: apiProbeError,
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
