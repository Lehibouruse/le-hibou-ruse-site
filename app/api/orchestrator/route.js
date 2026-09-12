import { NextResponse } from "next/server";
import { createRecord, queryRecords, TABLES, updateRecord } from "../../../lib/airtable";

const waitSeconds = (retry) => Math.min(3600, 60 * 2 ** retry);

async function log(job, status, message, started, externalId = "") {
  return createRecord(TABLES.journal, {
    Workflow: "Hibou Orchestrator",
    Déclencheur: job.fields.requested_by || "Jobs",
    Action: job.fields.action?.name || job.fields.action || "UNKNOWN",
    Statut: status,
    "Dernière exécution": new Date().toISOString(),
    "ID externe": externalId,
    Erreur: status === "Completed" ? "" : message,
    Notes: `job=${job.fields.job_id}; durée_ms=${Date.now() - started}; ${message}`,
  });
}

async function runAction(job) {
  const action = job.fields.action?.name || job.fields.action;
  const parameters = JSON.parse(job.fields.parameters || "{}");

  if (action === "UPDATE_CHECKOUT") {
    const records = await queryRecords(TABLES.configuration, { filterByFormula: "{Clé}='checkout_url'", pageSize: 1 });
    if (!records[0]) throw new Error("Configuration checkout_url introuvable");
    const url = String(parameters.checkout_url || "");
    if (url && !url.startsWith("https://")) throw new Error("checkout_url doit utiliser HTTPS");
    await updateRecord(TABLES.configuration, records[0].id, { Valeur: url, Statut: url ? "Actif" : "En attente", Erreur: url ? "" : "Checkout non configuré" });
    return { result: "Checkout central mis à jour" };
  }

  if (action === "UPDATE_SITE") {
    if (!parameters.key) throw new Error("parameters.key requis");
    const records = await queryRecords(TABLES.cms, { filterByFormula: `{Clé}='${String(parameters.key).replaceAll("'", "\\'")}'`, pageSize: 1 });
    if (!records[0]) throw new Error(`Bloc CMS introuvable: ${parameters.key}`);
    const allowed = ["Titre", "Sous-titre", "Contenu", "CTA texte", "CTA URL", "Image URL", "Publié"];
    const fields = Object.fromEntries(Object.entries(parameters.fields || {}).filter(([key]) => allowed.includes(key)));
    if (!Object.keys(fields).length) throw new Error("Aucun champ CMS autorisé fourni");
    await updateRecord(TABLES.cms, records[0].id, fields);
    return { result: `Bloc ${parameters.key} mis à jour` };
  }

  if (action === "CREATE_ARTICLE") {
    const article = parameters.article || {};
    if (!article.Titre || !article.Slug || !article.Résumé || !article.Contenu) throw new Error("Titre, Slug, Résumé et Contenu requis");
    const existing = await queryRecords(TABLES.articles, { filterByFormula: `{Slug}='${String(article.Slug).replaceAll("'", "\\'")}'`, pageSize: 1 });
    if (existing[0]) return { result: "Article déjà présent (dédupliqué)", external_id: existing[0].id };
    const created = await createRecord(TABLES.articles, { ...article, Publié: false });
    return { result: "Brouillon d’article créé", external_id: created.records?.[0]?.id || "" };
  }

  if (action === "PUBLISH_ARTICLE") {
    const slug = parameters.slug || job.fields.target;
    const records = await queryRecords(TABLES.articles, { filterByFormula: `{Slug}='${String(slug).replaceAll("'", "\\'")}'`, pageSize: 1 });
    if (!records[0]) throw new Error(`Article introuvable: ${slug}`);
    await updateRecord(TABLES.articles, records[0].id, { Publié: true, "Date publication": new Date().toISOString() });
    return { result: "Article publié", external_id: records[0].id };
  }

  throw new Error(`Action non encore branchée: ${action}`);
}

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const candidates = await queryRecords(TABLES.jobs, {
    filterByFormula: "OR({status}='Pending',AND({status}='Retry',OR({next_run_at}=BLANK(),{next_run_at}<=NOW())))",
    sortField: "created_at", pageSize: 1,
  });
  const job = candidates[0];
  if (!job) return NextResponse.json({ ok: true, processed: 0 });

  const started = Date.now();
  const idempotencyKey = job.fields.idempotency_key;
  if (idempotencyKey) {
    const completed = await queryRecords(TABLES.jobs, { filterByFormula: `AND({idempotency_key}='${String(idempotencyKey).replaceAll("'", "\\'")}',{status}='Completed')`, pageSize: 2 });
    if (completed.some((record) => record.id !== job.id)) {
      await updateRecord(TABLES.jobs, job.id, { status: "Completed", completed_at: new Date().toISOString(), result: "Action déjà exécutée (dédupliquée)." });
      await log(job, "Completed", "Dédupliqué par idempotency_key", started);
      return NextResponse.json({ ok: true, processed: 1, deduplicated: true });
    }
  }

  await updateRecord(TABLES.jobs, job.id, { status: "Running", started_at: new Date().toISOString(), error: "" });
  try {
    const outcome = await runAction(job);
    await updateRecord(TABLES.jobs, job.id, { status: "Completed", completed_at: new Date().toISOString(), result: outcome.result, external_id: outcome.external_id || "", error: "" });
    await log(job, "Completed", outcome.result, started, outcome.external_id);
    return NextResponse.json({ ok: true, processed: 1, job_id: job.fields.job_id });
  } catch (error) {
    const retry = Number(job.fields.retry_count || 0) + 1;
    const max = Number(job.fields.max_retries ?? 2);
    const terminal = retry > max;
    const status = terminal ? (job.fields.requires_review ? "Manual Review" : "Error") : "Retry";
    const next = terminal ? null : new Date(Date.now() + waitSeconds(retry) * 1000).toISOString();
    await updateRecord(TABLES.jobs, job.id, { status, retry_count: retry, next_run_at: next, error: String(error.message || error).slice(0, 5000) });
    await log(job, status, String(error.message || error), started);
    return NextResponse.json({ ok: false, job_id: job.fields.job_id, status }, { status: terminal ? 422 : 503 });
  }
}
