import { queryRecords, TABLES, updateRecord } from "./airtable.js";

const KEYS = ["openai_credit_circuit_until", "openai_credit_circuit_reason", "openai_credit_circuit_minutes"];

function text(value) { return String(value ?? "").trim(); }

export function isCreditExhausted(value) {
  return /credit_balance_exhausted|insufficient_quota|billing_hard_limit/i.test(text(value));
}

export function circuitState(config = {}, now = Date.now()) {
  const untilRaw = text(config.openai_credit_circuit_until);
  const untilMs = Date.parse(untilRaw);
  const active = Number.isFinite(untilMs) && untilMs > now;
  return {
    active,
    until: Number.isFinite(untilMs) ? new Date(untilMs).toISOString() : "",
    reason: text(config.openai_credit_circuit_reason),
    minutes: Math.max(15, Math.min(360, Number(config.openai_credit_circuit_minutes || 60) || 60)),
  };
}

async function circuitRecords() {
  return queryRecords(TABLES.configuration, {
    filterByFormula: `OR(${KEYS.map((key) => `{Clé}='${key}'`).join(",")})`,
    pageSize: 10,
    priorityAware: false,
  });
}

export async function readOpenAiCircuit(now = Date.now()) {
  const rows = await circuitRecords();
  const config = Object.fromEntries(rows.map((row) => [row.fields?.Clé, row.fields?.Valeur || ""]));
  return { ...circuitState(config, now), rows };
}

export async function openOpenAiCircuit(reason, now = Date.now()) {
  const state = await readOpenAiCircuit(now);
  const until = new Date(now + state.minutes * 60_000).toISOString();
  const byKey = Object.fromEntries((state.rows || []).map((row) => [row.fields?.Clé, row]));
  for (const [key, value] of [
    ["openai_credit_circuit_until", until],
    ["openai_credit_circuit_reason", text(reason).slice(0, 900)],
  ]) {
    const row = byKey[key];
    if (row?.id) await updateRecord(TABLES.configuration, row.id, { Valeur: value, Statut: "En attente", Erreur: key.endsWith("reason") ? value : "" });
  }
  return { active: true, until, reason: text(reason), minutes: state.minutes };
}

export async function clearOpenAiCircuit() {
  const state = await readOpenAiCircuit();
  for (const row of state.rows || []) {
    if (!["openai_credit_circuit_until", "openai_credit_circuit_reason"].includes(row.fields?.Clé)) continue;
    await updateRecord(TABLES.configuration, row.id, { Valeur: "", Statut: "Actif", Erreur: "" });
  }
  return { active: false, until: "", reason: "" };
}
