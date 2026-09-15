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
    method: "PATCH", headers: authHeaders, body: JSON.stringify({ fields }), cache: "no-store",
  });
  if (!response.ok) throw new Error(`Airtable update failed: ${response.status}`);
  return response.json();
}

export async function getRecord(tableId, recordId) {
  const authHeaders = headers();
  if (!authHeaders) throw new Error("Configuration Airtable absente");
  const response = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${tableId}/${recordId}`, {
    headers: authHeaders,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Airtable record read failed: ${response.status}`);
  return response.json();
}

export async function queryRecordsPage(tableId, query = {}) {
  const authHeaders = headers();
  if (!authHeaders) throw new Error("Configuration Airtable absente");
  const params = buildQueryParams(tableId, query, 10);
  const response = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${tableId}?${params}`, { headers: authHeaders, cache: "no-store" });
  if (!response.ok) throw new Error(`Airtable query failed: ${response.status}`);
  const data = await response.json();
  return { records: data.records || [], offset: data.offset || "" };
}

export async function queryRecords(tableId, query = {}) {
  return (await queryRecordsPage(tableId, query)).records;
}

export async function queryAllRecords(tableId, query = {}, options = {}) {
  const maxPages = Math.max(1, Math.min(50, Number(options.maxPages || 20)));
  const maxRecords = Math.max(1, Math.min(5000, Number(options.maxRecords || 2000)));
  const records = [];
  let offset = query.offset || "";
  for (let page = 0; page < maxPages && records.length < maxRecords; page += 1) {
    const result = await queryRecordsPage(tableId, { ...query, pageSize: 100, offset });
    records.push(...result.records.slice(0, maxRecords - records.length));
    if (!result.offset) break;
    offset = result.offset;
  }
  return records;
}

export async function getAllRecords(tableId, options = {}) {
  return queryAllRecords(tableId, {}, options);
}

export async function getRecords(tableId, options = {}) {
  const authHeaders = headers();
  if (!authHeaders) return [];
  const params = buildQueryParams(tableId, { ...options, pageSize: options.pageSize || 100 }, 100);
  try {
    const response = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${tableId}?${params}`, {
      headers: authHeaders,
      cache: "no-store",
    });
    if (!response.ok) {
      console.error("Airtable read failed", tableId, response.status);
      return [];
    }
    return (await response.json()).records || [];
  } catch (error) {
    console.error("Airtable unavailable", tableId, error);
    return [];
  }
}

export async function createRecord(tableId, fields) {
  const authHeaders = headers();
  if (!authHeaders) throw new Error("Configuration Airtable absente");
  const response = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${tableId}`, {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ records: [{ fields }] }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Airtable write failed: ${response.status}`);
  return response.json();
}

export function block(records, key) {
  return records.find((record) => record.fields.Clé === key)?.fields || {};
}

export function configMap(records) {
  return Object.fromEntries(records.filter((record) => record.fields.Actif !== false).map((record) => [record.fields.Clé, record.fields.Valeur || ""]));
}
