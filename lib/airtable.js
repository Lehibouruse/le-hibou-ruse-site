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
};

function headers() {
  const token = process.env.AIRTABLE_TOKEN;
  if (!token) return null;
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export function buildQueryParams(tableId, query = {}, defaultPageSize = 10) {
  const params = new URLSearchParams({ pageSize: String(query.pageSize || defaultPageSize) });
  if (query.filterByFormula) params.set("filterByFormula", query.filterByFormula);

  const direction = query.sortDirection || "asc";
  const priorityQueue = tableId === TABLES.jobs
    && query.sortField === "created_at"
    && direction === "asc"
    && query.priorityAware !== false;

  if (priorityQueue) {
    // Airtable sorts a single-select using its configured choice order.
    // Jobs.priority is configured Critical, High, Normal, Low.
    params.set("sort[0][field]", "priority");
    params.set("sort[0][direction]", "asc");
    params.set("sort[1][field]", "created_at");
    params.set("sort[1][direction]", "asc");
  } else if (query.sortField) {
    params.set("sort[0][field]", query.sortField);
    params.set("sort[0][direction]", direction);
  }
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

export async function queryRecords(tableId, query = {}) {
  const authHeaders = headers();
  if (!authHeaders) throw new Error("Configuration Airtable absente");
  const params = buildQueryParams(tableId, query, 10);
  const response = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${tableId}?${params}`, { headers: authHeaders, cache: "no-store" });
  if (!response.ok) throw new Error(`Airtable query failed: ${response.status}`);
  return (await response.json()).records || [];
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
