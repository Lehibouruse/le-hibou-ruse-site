function text(value) { return String(value ?? "").trim(); }
function select(value) { return value?.name || value || ""; }
function dateMs(value) { const ms = Date.parse(text(value)); return Number.isFinite(ms) ? ms : 0; }

export function systemHealthSnapshot({ jobs = [], sales = [], book = [], socialCredentials = [], circuit = {}, readiness = null, now = Date.now() } = {}) {
  const issues = [];
  const add = (severity, code, detail, count = 1) => issues.push({ severity, code, detail, count });

  const runningExpired = jobs.filter((job) => select(job.fields?.status) === "Running" && dateMs(job.fields?.lease_expires_at) > 0 && dateMs(job.fields?.lease_expires_at) < now);
  if (runningExpired.length) add("critical", "job_lease_expired", `${runningExpired.length} Job(s) Running avec bail expiré`, runningExpired.length);

  const overdueRetry = jobs.filter((job) => select(job.fields?.status) === "Retry" && dateMs(job.fields?.next_run_at) > 0 && dateMs(job.fields?.next_run_at) < now - 15 * 60_000);
  if (overdueRetry.length) add("warning", "retry_overdue", `${overdueRetry.length} Job(s) Retry auraient déjà dû être repris`, overdueRetry.length);

  const recentCreditErrors = jobs.filter((job) => /credit_balance_exhausted|insufficient_quota|billing_hard_limit/i.test(text(job.fields?.error)) && dateMs(job.fields?.started_at) > now - 2 * 60 * 60_000);
  if (circuit.active) add("warning", "openai_credit_circuit_open", `Circuit IA ouvert jusqu'à ${circuit.until || "?"}: ${circuit.reason || "crédit indisponible"}`, recentCreditErrors.length || 1);
  else if (recentCreditErrors.length) add("critical", "openai_credit_exhausted_unprotected", `${recentCreditErrors.length} erreur(s) crédit OpenAI récente(s) sans circuit actif`, recentCreditErrors.length);

  const commerceStuck = sales.filter((sale) => {
    const status = text(sale.fields?.["Livraison statut"]);
    const lease = dateMs(sale.fields?.["Commerce lease expires"]);
    return ["processing", "revoking"].includes(status) && lease > 0 && lease < now;
  });
  if (commerceStuck.length) add("critical", "commerce_lease_expired", `${commerceStuck.length} livraison(s)/révocation(s) avec bail expiré`, commerceStuck.length);

  const commerceReview = sales.filter((sale) => ["manual_review", "failed"].includes(text(sale.fields?.["Livraison statut"])));
  if (commerceReview.length) add("warning", "commerce_manual_review", `${commerceReview.length} vente(s) nécessitent une revue livraison`, commerceReview.length);

  const corpusChapters = book.filter((row) => Number(row.fields?.["Source début"]) > 0 && Number(row.fields?.["Source fin"]) > 0);
  const assembled = corpusChapters.filter((row) => {
    const start = Number(row.fields?.["Source début"]); const end = Number(row.fields?.["Source fin"]);
    return Number(row.fields?.["Montages couverts"] || 0) === end - start + 1 && text(row.fields?.["QC éditorial"]).toLowerCase() !== "fail";
  });
  const failedBook = corpusChapters.filter((row) => text(row.fields?.["QC éditorial"]).toLowerCase() === "fail");
  if (failedBook.length) add("warning", "book_qc_failed", `${failedBook.length} chapitre(s) ont un QC éditorial en échec`, failedBook.length);

  const connectedSocial = socialCredentials.filter((row) => text(select(row.fields?.Status)).toLowerCase() === "connected").length;
  const socialErrors = socialCredentials.filter((row) => text(row.fields?.["Last error"]));
  if (socialErrors.length) add("warning", "social_oauth_error", `${socialErrors.length} credential(s) sociaux ont une erreur OAuth`, socialErrors.length);

  const readinessBlockers = readiness?.blockers || [];
  const critical = issues.some((issue) => issue.severity === "critical");
  const warning = issues.some((issue) => issue.severity === "warning");
  return {
    ok: !critical,
    severity: critical ? "critical" : warning ? "degraded" : "ok",
    issues,
    counts: {
      jobs: jobs.length,
      running_expired: runningExpired.length,
      retry_overdue: overdueRetry.length,
      recent_credit_errors: recentCreditErrors.length,
      sales: sales.length,
      commerce_stuck: commerceStuck.length,
      book_corpus_chapters: corpusChapters.length,
      book_assembled_chapters: assembled.length,
      social_credentials: socialCredentials.length,
      social_connected: connectedSocial,
      launch_blockers: readinessBlockers.length,
    },
    launch_ready: Boolean(readiness?.ready),
    launch_blockers: readinessBlockers.map((item) => ({ key: item.key, detail: item.detail })),
  };
}

export function healthFingerprint(snapshot = {}) {
  return JSON.stringify({
    severity: snapshot.severity || "unknown",
    issues: (snapshot.issues || []).map((item) => [item.severity, item.code, item.count]),
    launch_ready: Boolean(snapshot.launch_ready),
    launch_blockers: (snapshot.launch_blockers || []).map((item) => item.key).sort(),
  });
}
