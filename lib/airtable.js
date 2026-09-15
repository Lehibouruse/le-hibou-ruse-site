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
};

function headers() {
  const token = process.env.AIRTABLE_TOKEN;
  if (!token) return null;
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export function buildQueryParams(tableId, query = {}, defaultPageSize = 10) {
  const params = new URLSearchParams({ pageSize: String(Math.min(100, Number(query.pageSize || defaultPageSize))) });
  if (query.filterByFormula) params.set("filterByFormula", query.filterByFormula);
  if (query.offset) params.set("offset", query.offset);

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
  const params = buildQueryParams(tableId, { ...options, pageSize: Math.min(100, Number(options.pageSize || 100)) }, 100);
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

export async function getAllRecords(tableId, options = {}) {
  const authHeaders = headers();
  if (!authHeaders) return [];
  const maxRecords = Math.max(1, Math.min(5000, Number(options.maxRecords || 1000)));
  const records = [];
  let offset = "";
  try {
    do {
      const params = buildQueryParams(tableId, { ...options, pageSize: 100, offset }, 100);
      const response = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${tableId}?${params}`, { headers: authHeaders, cache: "no-store" });
      if (!response.ok) {
        console.error("Airtable paginated read failed", tableId, response.status);
        break;
      }
      const data = await response.json();
      records.push(...(data.records || []));
      offset = data.offset || "";
    } while (offset && records.length < maxRecords);
    return records.slice(0, maxRecords);
  } catch (error) {
    console.error("Airtable paginated read unavailable", tableId, error);
    return records;
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
