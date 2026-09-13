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
};

function headers() {
  const token = process.env.AIRTABLE_TOKEN;
  if (!token) return null;
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
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

export async function queryRecords(tableId, query = {}) {
  const authHeaders = headers();
  if (!authHeaders) throw new Error("Configuration Airtable absente");
  const params = new URLSearchParams({ pageSize: String(query.pageSize || 10) });
  if (query.filterByFormula) params.set("filterByFormula", query.filterByFormula);
  if (query.sortField) {
    params.set("sort[0][field]", query.sortField);
    params.set("sort[0][direction]", query.sortDirection || "asc");
  }
  const response = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${tableId}?${params}`, { headers: authHeaders, cache: "no-store" });
  if (!response.ok) throw new Error(`Airtable query failed: ${response.status}`);
  return (await response.json()).records || [];
}

export async function getRecords(tableId, options = {}) {
  const authHeaders = headers();
  if (!authHeaders) return [];
  const params = new URLSearchParams({ pageSize: "100" });
  if (options.filterByFormula) params.set("filterByFormula", options.filterByFormula);
  if (options.sortField) {
    params.set("sort[0][field]", options.sortField);
    params.set("sort[0][direction]", options.sortDirection || "asc");
  }
  try {
    const response = await fetch(`https://api.airtable.com/v0/${BASE_ID}/${tableId}?${params}`, {
      headers: authHeaders,
      next: { revalidate: 60 },
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

