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
  const product = products[0] || null;
  const runtime = digifyReadiness(process.env);
  const fileGuid = text(product?.fields?.["Digify File GUID"]);
  const launchAuthorized = truthy(config.commerce_launch_authorized);

  const result = {
    ok: true,
    mode: "readiness_only",
    side_effects_enabled: false,
    credentials_present: runtime.credentials_present,
    add_recipient_endpoint: runtime.add_recipient_endpoint || DIGIFY_ADD_RECIPIENT_DEFAULT_URL,
    add_template_present: runtime.add_template_present,
    revoke_endpoint_present: runtime.revoke_endpoint_present,
    revoke_template_present: runtime.revoke_template_present,
    webhook_auth_ready: runtime.webhook_auth_ready,
    webhook_auth_source: runtime.webhook_auth_source,
    webhook_endpoint: "https://le-hibou-ruse-site.vercel.app/api/commerce/digify-webhook",
    file_guid_present: Boolean(fileGuid),
    commerce_launch_authorized: launchAuthorized,
    delivery_ready: Boolean(runtime.credentials_present && runtime.add_template_present && fileGuid && launchAuthorized),
    revocation_ready: Boolean(runtime.credentials_present && runtime.revoke_endpoint_present && runtime.revoke_template_present && fileGuid),
  };

  return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
}
