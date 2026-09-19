import { NextResponse } from "next/server";
import { configMap, queryRecords, TABLES } from "../../../../lib/airtable";
import { addDigifyRecipient, revokeDigifyRecipient, searchDigifyFiles } from "../../../../lib/commerce.mjs";
import { verifyGithubActionsToken } from "../../../../lib/github-oidc.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const OIDC_WORKFLOW = "digify-contract-test.yml";
const PROBE_EMAIL = "api-probe@d4d5d6.com";

function text(value) { return String(value ?? "").trim(); }
function truthy(value) { return ["1", "true", "yes", "oui", "on"].includes(text(value).toLowerCase()); }

async function authenticate(request) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) throw new Error("Unauthorized");
  await verifyGithubActionsToken(auth.slice("Bearer ".length), {
    allowedWorkflowFiles: [OIDC_WORKFLOW],
    allowedEvents: ["push", "workflow_dispatch"],
  });
}

function selectProduct(products = []) {
  return products.find((record) => /guide du hibou rusé/i.test(text(record?.fields?.Produit)))
    || products[0]
    || null;
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
  if (truthy(config.commerce_launch_authorized)) {
    return NextResponse.json({ ok: false, error: "Contract test blocked while commerce launch is authorized" }, { status: 409 });
  }

  const product = selectProduct(products);
  const configuredFileGuid = text(product?.fields?.["Digify File GUID"]);

  let searchFiles = [];
  let authOrientation = "normal";
  let digifyEnv = process.env;
  try {
    const searched = await searchDigifyFiles({ searchQuery: "Hibou", pageIndex: 0, pageSize: 40 }, digifyEnv);
    searchFiles = searched.files || [];
  } catch (normalError) {
    const keyId = text(process.env.DIGIFY_KEY_ID);
    const secret = text(process.env.DIGIFY_SECRET);
    if (!keyId || !secret) {
      return NextResponse.json({
        ok: false,
        stage: "search",
        search_ok: false,
        auth_orientation: "missing",
        error: String(normalError?.message || normalError).slice(0, 500),
      }, { status: 422 });
    }
    const swappedEnv = { ...process.env, DIGIFY_KEY_ID: secret, DIGIFY_SECRET: keyId };
    try {
      const searched = await searchDigifyFiles({ searchQuery: "Hibou", pageIndex: 0, pageSize: 40 }, swappedEnv);
      searchFiles = searched.files || [];
      digifyEnv = swappedEnv;
      authOrientation = "swapped";
    } catch (swappedError) {
      return NextResponse.json({
        ok: false,
        stage: "search",
        search_ok: false,
        auth_orientation: "neither",
        normal_error: String(normalError?.message || normalError).slice(0, 300),
        swapped_error: String(swappedError?.message || swappedError).slice(0, 300),
      }, { status: 422 });
    }
  }

  const exact = searchFiles.find((item) => text(item?.Guid) === configuredFileGuid);
  const candidate = exact
    || searchFiles.find((item) => /le[_ ]?hibou|hibou/i.test(text(item?.Name)))
    || searchFiles[0]
    || null;
  const fileGuid = text(candidate?.Guid);
  const fileName = text(candidate?.Name);
  if (!fileGuid) {
    return NextResponse.json({
      ok: false,
      stage: "search",
      search_ok: true,
      error: "No Hibou file returned by Digify search",
    }, { status: 422 });
  }

  let addOk = false;
  let removeOk = false;
  let accessUrlRecorded = false;
  let addStatus = "";
  let removeStatus = "";
  let cleanupError = "";

  try {
    const added = await addDigifyRecipient({
      fileGuid,
      email: PROBE_EMAIL,
      orderId: "DIGIFY-CONTRACT-PROBE",
    }, digifyEnv);
    addOk = true;
    accessUrlRecorded = Boolean(added.accessUrl);
    addStatus = text(added?.data?.Status?.StatusMessage || "ok");
  } catch (error) {
    return NextResponse.json({
      ok: false,
      stage: "add",
      add_ok: false,
      error: String(error?.message || error).slice(0, 500),
    }, { status: 422 });
  }

  try {
    const removed = await revokeDigifyRecipient({
      fileGuid,
      email: PROBE_EMAIL,
      orderId: "DIGIFY-CONTRACT-PROBE",
    }, digifyEnv);
    removeOk = true;
    removeStatus = text(removed?.data?.Status?.StatusMessage || "ok");
  } catch (error) {
    cleanupError = String(error?.message || error).slice(0, 500);
  }

  return NextResponse.json({
    ok: addOk && removeOk,
    stage: removeOk ? "complete" : "cleanup_failed",
    add_ok: addOk,
    remove_ok: removeOk,
    access_url_recorded: accessUrlRecorded,
    add_status: addStatus,
    remove_status: removeStatus,
    cleanup_error: cleanupError,
    probe_email: PROBE_EMAIL,
    selected_product: text(product?.fields?.Produit),
    discovered_file_guid: fileGuid,
    configured_file_guid: configuredFileGuid,
    file_guid_matches: Boolean(configuredFileGuid && configuredFileGuid === fileGuid),
    discovered_file_name: fileName,
    auth_orientation: authOrientation,
  }, { status: addOk && removeOk ? 200 : 502, headers: { "Cache-Control": "no-store" } });
}
