import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { configMap, createRecord, queryAllRecords, queryRecords, TABLES, updateRecord } from "../../../lib/airtable";
import { verifyGithubActionsToken } from "../../../lib/github-oidc.mjs";
import { commercialReadiness } from "../../../lib/launch-readiness.mjs";
import { clearOpenAiCircuit, isCreditExhausted, openOpenAiCircuit, readOpenAiCircuit } from "../../../lib/openai-circuit.mjs";
import { healthFingerprint, systemHealthSnapshot } from "../../../lib/system-health.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

function text(value) { return String(value ?? "").trim(); }
function select(value) { return value?.name || value || ""; }
function dateMs(value) { const ms = Date.parse(text(value)); return Number.isFinite(ms) ? ms : 0; }

async function authenticate(request) {
  const auth = request.headers.get("authorization") || "";
  if (!auth.startsWith("Bearer ")) throw new Error("Unauthorized");
  const token = auth.slice("Bearer ".length);
  if (process.env.CRON_SECRET && token === process.env.CRON_SECRET) return;
  await verifyGithubActionsToken(token);
}

async function loadState() {
  const [jobs, sales, book, socialCredentials, configuration, products, legal] = await Promise.all([
    queryAllRecords(TABLES.jobs, { sortField: "created_at", sortDirection: "desc" }, { maxRecords: 800 }),
    queryAllRecords(TABLES.sales, {}, { maxRecords: 1000 }),
    queryAllRecords(TABLES.book, {}, { maxRecords: 100 }),
    queryAllRecords(TABLES.socialCredentials, {}, { maxRecords: 50 }),
    queryAllRecords(TABLES.configuration, {}, { maxRecords: 200 }),
    queryAllRecords(TABLES.products, {}, { maxRecords: 50 }),
    queryAllRecords(TABLES.legal, {}, { maxRecords: 100 }),
  ]);
  const config = configMap(configuration);
  const product = products.find((row) => row.fields?.Actif)?.fields || {};
  const readiness = commercialReadiness({ config, product, chapters: book, legal });
  return { jobs, sales, book, socialCredentials, configuration, config, readiness };
}

function latestCreditError(jobs) {
  return jobs
    .filter((job) => isCreditExhausted(job.fields?.error))
    .map((job) => ({ job, at: dateMs(job.fields?.started_at) || dateMs(job.fields?.created_at) }))
    .filter((item) => item.at > 0)
    .sort((a, b) => b.at - a.at)[0] || null;
}

function latestAiSuccess(jobs) {
  return jobs
    .filter((job) => select(job.fields?.status) === "Completed" && ["CREATE_BOOK", "CREATE_VIDEO", "CREATE_VARIATION"].includes(select(job.fields?.action)))
    .map((job) => ({ job, at: dateMs(job.fields?.completed_at) || dateMs(job.fields?.started_at) }))
    .filter((item) => item.at > 0)
    .sort((a, b) => b.at - a.at)[0] || null;
}

async function postponeCreditRetries(jobs, until) {
  const untilMs = dateMs(until);
  let changed = 0;
  for (const job of jobs) {
    if (select(job.fields?.status) !== "Retry" || !isCreditExhausted(job.fields?.error)) continue;
    if (dateMs(job.fields?.next_run_at) >= untilMs) continue;
    await updateRecord(TABLES.jobs, job.id, {
      next_run_at: until,
      agent_status: "needs_escalation",
      lock_token: "",
      lease_expires_at: null,
    });
    changed += 1;
  }
  return changed;
}

async function journalSnapshot(snapshot, actions) {
  if (snapshot.severity === "ok" && !actions.length) return;
  const fingerprint = healthFingerprint(snapshot);
  const hour = new Date().toISOString().slice(0, 13);
  const externalId = createHash("sha256").update(`${hour}:${fingerprint}`).digest("hex").slice(0, 32);
  const existing = await queryRecords(TABLES.journal, {
    filterByFormula: `{ID externe}='${externalId}'`,
    pageSize: 1,
    priorityAware: false,
  });
  if (existing.length) return;
  await createRecord(TABLES.journal, {
    Workflow: "HIBOU_SYSTEM_WATCHDOG_V1",
    Déclencheur: "GitHub schedule",
    Action: `health · ${snapshot.severity}`,
    Statut: snapshot.severity,
    "Dernière exécution": new Date().toISOString(),
    "ID externe": externalId,
    Erreur: snapshot.severity === "critical" ? snapshot.issues.map((item) => `${item.code}:${item.count}`).join("; ").slice(0, 5000) : "",
    Notes: JSON.stringify({ fingerprint, actions, counts: snapshot.counts, issues: snapshot.issues, launch_blockers: snapshot.launch_blockers }).slice(0, 10000),
  }).catch(() => {});
}

export async function POST(request) {
  try {
    await authenticate(request);
    const now = Date.now();
    const state = await loadState();
    let circuit = await readOpenAiCircuit(now);
    const actions = [];
    const credit = latestCreditError(state.jobs);
    const success = latestAiSuccess(state.jobs);
    const previousUntil = dateMs(circuit.until);

    // Only a NEW credit failure after the last circuit window can reopen it.
    if (!circuit.active && credit?.at && (!previousUntil || credit.at >= previousUntil)) {
      circuit = await openOpenAiCircuit(credit.job.fields?.error || "credit_balance_exhausted", now);
      actions.push({ action: "open_openai_credit_circuit", until: circuit.until, job_id: credit.job.fields?.job_id || credit.job.id });
    }

    if (circuit.active) {
      const postponed = await postponeCreditRetries(state.jobs, circuit.until);
      if (postponed) actions.push({ action: "postpone_credit_retries", count: postponed, until: circuit.until });
    } else if (previousUntil && success?.at > previousUntil) {
      await clearOpenAiCircuit();
      circuit = { ...circuit, active: false, until: "", reason: "" };
      actions.push({ action: "clear_openai_credit_circuit", job_id: success.job.fields?.job_id || success.job.id });
    }

    const snapshot = systemHealthSnapshot({
      jobs: state.jobs,
      sales: state.sales,
      book: state.book,
      socialCredentials: state.socialCredentials,
      circuit,
      readiness: state.readiness,
      now,
    });
    await journalSnapshot(snapshot, actions);
    return NextResponse.json({ ...snapshot, circuit: { active: circuit.active, until: circuit.until, reason: circuit.reason }, actions, checked_at: new Date().toISOString() });
  } catch (error) {
    const message = String(error?.message || error).slice(0, 1000);
    return NextResponse.json({ ok: false, severity: "critical", error: message, checked_at: new Date().toISOString() }, { status: message === "Unauthorized" ? 401 : 500 });
  }
}
