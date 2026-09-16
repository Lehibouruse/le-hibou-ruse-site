import { queryRecords, TABLES, updateRecord } from "./airtable.js";

const PLATFORM = {
  youtube: "YouTube", instagram: "Instagram", facebook: "Facebook", tiktok: "TikTok",
  linkedin: "LinkedIn", threads: "Threads", pinterest: "Pinterest", x: "X", snapchat: "Snapchat",
};

function clean(value) { return String(value ?? "").trim(); }
function select(value) { return value?.name || value || ""; }
function escFormula(value) { return clean(value).replaceAll("\\", "\\\\").replaceAll("'", "\\'"); }
function truthy(value) {
  if (value === true) return true;
  return ["1", "true", "yes", "oui", "on"].includes(clean(value).toLowerCase());
}

export function analyticsResultIsValidated(metrics = {}) {
  const status = clean(metrics.analytics_status).toLowerCase();
  if (!status) return true;
  return ["active", "ok", "available"].includes(status);
}

async function accountRecord(provider) {
  const platform = PLATFORM[clean(provider).toLowerCase()];
  if (!platform) return null;
  const rows = await queryRecords(TABLES.socialAccounts, {
    filterByFormula: `{Plateforme}='${escFormula(platform)}'`,
    pageSize: 2,
    priorityAware: false,
  });
  return rows[0] || null;
}

export async function markSocialAnalyticsValidated(providerInput, metrics = {}) {
  const provider = clean(providerInput).toLowerCase();
  if (!PLATFORM[provider]) return { updated: false, reason: "unsupported_provider" };
  if (!analyticsResultIsValidated(metrics)) {
    return { updated: false, reason: clean(metrics.analytics_status) || "analytics_not_validated" };
  }
  const row = await accountRecord(provider);
  if (!row) return { updated: false, reason: "account_record_missing" };
  const fields = row.fields || {};
  const now = new Date().toISOString();
  const readOk = truthy(fields["Lecture API OK"]);
  const publishOk = truthy(fields["Publication testée"]);
  await updateRecord(TABLES.socialAccounts, row.id, {
    "Analytics OK": true,
    "Dernier test API": now,
    "Dernière vérification": now,
    ...(readOk && publishOk ? { "État direct": "CONNECTED_AND_TESTED" } : {}),
  });
  return { updated: true, record_id: row.id, state: readOk && publishOk ? "CONNECTED_AND_TESTED" : clean(fields["État direct"]) };
}
