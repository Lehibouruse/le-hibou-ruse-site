import { createRecord, queryRecords, TABLES, updateRecord } from "./airtable.js";
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

export function routeTransition(current = {}, next = {}) {
  const changes = {};
  for (const field of Object.values(ROUTE_FIELDS)) {
    const before = clean(current[field]) || "blocked";
    const after = clean(next[field]) || "blocked";
    if (before !== after) changes[field] = { from: before, to: after };
  }
  return changes;
}

async function journalRouteTransition(provider, platform, changes) {
  if (!Object.keys(changes).length) return;
  const now = new Date().toISOString();
  await createRecord(TABLES.journal, {
    Workflow: "HIBOU_SOCIAL_ROUTING_V1",
    Déclencheur: "state reconciliation",
    Action: `${provider} · route transition`,
    Statut: "ok",
    "Dernière exécution": now,
    "ID externe": `social-route:${provider}:${Date.now()}`,
    Erreur: "",
    Notes: JSON.stringify({ provider, platform, changes, at: now }).slice(0, 10000),
  }).catch(() => {});
}

export async function syncSocialRoutingPlanToAirtable(env = process.env) {
  const accounts = await queryRecords(TABLES.socialAccounts, { pageSize: 50 });
  const gateways = await socialGatewayStatusWithVault(env);
  const plans = Object.fromEntries(["read", "publish", "analytics"].map((operation) => [
    operation,
    buildSocialRoutingPlan({ operation, accounts, gateways }),
  ]));

  const updated = [];
  const unchanged = [];
  for (const account of accounts) {
    const provider = providerForPlatform(account.fields?.Plateforme);
    if (!provider) continue;
    const fields = routeFieldsForProvider(provider, plans);
    const changes = routeTransition(account.fields || {}, fields);
    const platform = select(account.fields?.Plateforme);
    if (!Object.keys(changes).length) {
      unchanged.push({ provider, platform, record_id: account.id });
      continue;
    }
    await updateRecord(TABLES.socialAccounts, account.id, fields);
    await journalRouteTransition(provider, platform, changes);
    updated.push({ provider, platform, record_id: account.id, changes, ...fields });
  }

  return {
    updated_count: updated.length,
    unchanged_count: unchanged.length,
    updated,
    summaries: Object.fromEntries(Object.entries(plans).map(([operation, plan]) => [operation, plan.summary])),
    synced_at: new Date().toISOString(),
  };
}
