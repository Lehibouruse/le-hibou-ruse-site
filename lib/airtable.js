const BASE_ID = "appWyUX7TYPNrDbyP";

export const TABLES = {
  cms: "tblkve6jfAgxfhCqB",
  articles: "tblSi46CBgAUHp3LL",
  products: "tblVaks8DSkziKEqB",
  configuration: "tblXZsL4gTTSXG72d",
  leads: "tblftjdWCg4xwUnIR",
  sales: "tblcwJtw4k7xEmT7n",
  jobs: "tblRLb9bWBzpBnD20",
  journal: "tblmbRJCreMtyUVna",
  montages: "tbl0rkv9c2ZJRUhGz",
  book: "tblIoXioiPj3Rxhft",
  content: "tblRfS6laFuNBrDX1",
  benchmark: "tblSgKKbhiLPMqm9O",
  legal: "tbl6253anwyBOh78X",
  socialAccounts: "tbljG9MzITNILBoHi",
  socialCredentials: "tblnSFykeeEKWNCv2",
  conversionEvents: "tbl7I3YhW09Ztuj2q",
  socialPerformance: "tbluRQl3ZdpF8baX7",
  growthExperiments: "tbljfryfQwIzybjBx",
};

function headers() {
  const token = process.env.AIRTABLE_TOKEN;
  if (!token) return null;
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function safePageSize(value, fallback = 10) {
  const parsed = Number(value || fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(100, Math.floor(parsed)));
}

export function buildQueryParams(tableId, query = {}, defaultPageSize = 10) {
  const params = new URLSearchParams({ pageSize: String(safePageSize(query.pageSize, defaultPageSize)) });
  if (query.filterByFormula) params.set("filterByFormula", query.filterByFormula);

  const direction = query.sortDirection || "asc";
  const priorityQueue = tableId === TABLES.jobs
    && query.sortField === "created_at"
    && direction === "asc"
    && query.priorityAware !== false;

  if (priorityQueue) {
    params.set("sort[0][field]", "priority");
    params.set("sort[0][direction]", "asc");
    params.set("sort[1][field]", "created_at");
    params.set("sort[1][direction]", "asc");
  } else if (query.sortField) {
    params.set("sort[0][field]", query.sortField);
    params.set("sort[0][direction]", direction);
  }
  if (query.offset) params.set("offset", String(query.offset));
  return params;
}

export async function updateRecord(tableId, recordId, fields) {
  const authHeaders = headers();
  if (!authHeaders) throw new Error("Configuration Airtable absente");
  const response = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${tableId}/${recordId}`, {
    method: "PATCH",
    headers: authHeaders,
    body: JSON.stringify({ fields }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Airtable PATCH ${response.status}: ${JSON.stringify(data)}`);
  return data;
}

export async function getRecord(tableId, recordId) {
  const authHeaders = headers();
  if (!authHeaders) throw new Error("Configuration Airtable absente");
  const response = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${tableId}/${recordId}`, { headers: authHeaders });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Airtable GET ${response.status}: ${JSON.stringify(data)}`);
  return data;
}

export async function queryRecords(tableId, query = {}) {
  const authHeaders = headers();
  if (!authHeaders) throw new Error("Configuration Airtable absente");
  const params = buildQueryParams(tableId, query, 10);
  const response = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${tableId}?${params.toString()}`, { headers: authHeaders });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Airtable LIST ${response.status}: ${JSON.stringify(data)}`);
  return data.records || [];
}

export async function queryAllRecords(tableId, query = {}, options = {}) {
  const authHeaders = headers();
  if (!authHeaders) throw new Error("Configuration Airtable absente");
  const maxRecords = Math.max(1, Math.min(10000, Number(options.maxRecords || 1000)));
  const pageSize = safePageSize(query.pageSize, 100);
  const records = [];
  let offset = "";
  do {
    const params = buildQueryParams(tableId, { ...query, pageSize, offset }, pageSize);
    const response = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${tableId}?${params.toString()}`, { headers: authHeaders });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Airtable LIST ${response.status}: ${JSON.stringify(data)}`);
    records.push(...(data.records || []));
    offset = data.offset || "";
  } while (offset && records.length < maxRecords);
  return records.slice(0, maxRecords);
}

export async function createRecord(tableId, fields) {
  const authHeaders = headers();
  if (!authHeaders) throw new Error("Configuration Airtable absente");
  const response = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${tableId}`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ fields }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Airtable POST ${response.status}: ${JSON.stringify(data)}`);
  return data;
}

export async function deleteRecord(tableId, recordId) {
  const authHeaders = headers();
  if (!authHeaders) throw new Error("Configuration Airtable absente");
  const response = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${tableId}/${recordId}`, {
    method: "DELETE",
    headers: authHeaders,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Airtable DELETE ${response.status}: ${JSON.stringify(data)}`);
  return data;
}

export function configMap(records) {
  return Object.fromEntries((records || []).filter((r) => r.fields?.Actif !== false).map((r) => [r.fields?.Clé, r.fields?.Valeur]));
}
