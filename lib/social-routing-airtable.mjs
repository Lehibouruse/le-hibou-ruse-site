import { queryRecords, TABLES, updateRecord } from "./airtable.js";
import { socialGatewayStatusWithVault } from "./social-credentials-runtime.mjs";
import { buildSocialRoutingPlan } from "./social-routing-plan.mjs";

const ROUTE_FIELDS = {
  read: "Route lecture",
  publish: "Route publication",
  analytics: "Route analytics",
};

function clean(value) { return String(value ?? "").trim(); }
function select(value) { return value?.name || value || ""; }

function providerForPlatform(value) {
  const platform = clean(select(value)).toLowerCase();
  return ({
    youtube: "youtube",
    instagram: "instagram",
    facebook: "facebook",
    tiktok: "tiktok",
    linkedin: "linkedin",
    threads: "threads",
    pinterest: "pinterest",
    x: "x",
    snapchat: "snapchat",
  })[platform] || "";
}

export function routeFieldsForProvider(provider, plans = {}) {
  const fields = {};
  for (const operation of Object.keys(ROUTE_FIELDS)) {
    const route = plans?.[operation]?.routes?.find((item) => item.provider === provider)?.route || "blocked";
    fields[ROUTE_FIELDS[operation]] = route;
  }
  return fields;
}

export async function syncSocialRoutingPlanToAirtable(env = process.env) {
  const accounts = await queryRecords(TABLES.socialAccounts, { pageSize: 50 });
  const gateways = await socialGatewayStatusWithVault(env);
  const plans = Object.fromEntries(["read", "publish", "analytics"].map((operation) => [
    operation,
    buildSocialRoutingPlan({ operation, accounts, gateways }),
  ]));

  const updated = [];
  for (const account of accounts) {
    const provider = providerForPlatform(account.fields?.Plateforme);
    if (!provider) continue;
    const fields = routeFieldsForProvider(provider, plans);
    await updateRecord(TABLES.socialAccounts, account.id, fields);
    updated.push({ provider, platform: select(account.fields?.Plateforme), record_id: account.id, ...fields });
  }

  return {
    updated_count: updated.length,
    updated,
    summaries: Object.fromEntries(Object.entries(plans).map(([operation, plan]) => [operation, plan.summary])),
    synced_at: new Date().toISOString(),
  };
}
